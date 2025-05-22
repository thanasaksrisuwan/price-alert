/**
 * ทดสอบสำหรับ binanceWebSocketService.js
 * Tests for the Binance WebSocket Service implementation
 */

const WebSocket = require('ws');
const EventEmitter = require('events');
const binanceWebSocketService = require('../../src/services/binanceWebSocketService');
const config = require('../../src/config');

// Mock dependencies
jest.mock('ws');
jest.mock('../../src/utils/logger', () => ({
  createModuleLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }))
}));

jest.mock('../../src/config', () => ({
  cryptoApis: {
    binance: {
      wsUrl: 'wss://test-stream.binance.com:9443/ws'
    }
  },
  websocket: {
    reconnectAttempts: 3,
    reconnectInterval: 1000,
    connectionTimeout: 5000,
    maxConnections: 10,
    maxStreamsPerConnection: 5
  }
}));

describe('BinanceWebSocketManager Tests', () => {
  let mockWsInstance;
  let mockEventEmitter;
  
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Create a mock WebSocket instance
    mockWsInstance = {
      on: jest.fn(),
      once: jest.fn(),
      send: jest.fn(),
      ping: jest.fn(),
      close: jest.fn(),
      terminate: jest.fn(),
      readyState: WebSocket.OPEN
    };
    
    // Set up WebSocket constructor mock
    WebSocket.mockImplementation(() => mockWsInstance);

    // Setup the WebSocket.OPEN constant
    WebSocket.OPEN = 1;
    WebSocket.CONNECTING = 0;
    WebSocket.CLOSING = 2;
    WebSocket.CLOSED = 3;
    
    // Mock event handling
    mockWsInstance.on.mockImplementation((event, callback) => {
      if (event === 'open') {
        // Simulate WebSocket open event
        setTimeout(() => callback(), 0);
      }
      return mockWsInstance;
    });
    
    mockWsInstance.once.mockImplementation((event, callback) => {
      if (event === 'open') {
        // Simulate WebSocket open event
        setTimeout(() => callback(), 0);
      }
      return mockWsInstance;
    });
    
    // Reset the internal state of the WebSocket service
    binanceWebSocketService.connections = new Map();
    binanceWebSocketService.streamCallbacks = new Map();
    binanceWebSocketService.connectionQueue = [];
    binanceWebSocketService.isProcessingQueue = false;

    // Mock setInterval and clearInterval to prevent actual timers in tests
    jest.useFakeTimers();
  });
  
  afterEach(() => {
    // Restore real timers
    jest.useRealTimers();
  });

  describe('connectToStream', () => {
    it('should queue a single stream connection request', async () => {
      // Arrange
      const streamName = 'btcusdt@trade';
      const onMessageCallback = jest.fn();
      const pushSpy = jest.spyOn(binanceWebSocketService.connectionQueue, 'push');
      
      // Act
      const promise = binanceWebSocketService.connectToStream(streamName, onMessageCallback);
      
      // Assert
      expect(pushSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'single',
          streamName,
          onMessageCallback,
          resolver: expect.any(Function),
          rejecter: expect.any(Function)
        })
      );
      
      // Manually resolve the connection to complete the test
      binanceWebSocketService.connectionQueue[0].resolver(true);
      const result = await promise;
      expect(result).toBe(true);
    });
    
    it('should start processing the connection queue if not already processing', async () => {
      // Arrange
      const streamName = 'btcusdt@trade';
      const onMessageCallback = jest.fn();
      const processQueueSpy = jest.spyOn(binanceWebSocketService, 'processConnectionQueue');
      
      // Act
      binanceWebSocketService.connectToStream(streamName, onMessageCallback);
      
      // Assert
      expect(processQueueSpy).toHaveBeenCalled();
    });
    
    it('should handle connection errors gracefully', async () => {
      // Arrange
      const streamName = 'btcusdt@trade';
      const onMessageCallback = jest.fn();
      
      // Simulate an error during queue handling
      jest.spyOn(binanceWebSocketService.connectionQueue, 'push').mockImplementation(() => {
        throw new Error('Queue error');
      });
      
      // Act
      const result = await binanceWebSocketService.connectToStream(streamName, onMessageCallback);
      
      // Assert
      expect(result).toBe(false);
    });
  });

  describe('connectToCombinedStreams', () => {
    it('should queue a combined stream connection request', async () => {
      // Arrange
      const streamNames = ['btcusdt@trade', 'ethusdt@trade'];
      const onMessageCallback = jest.fn();
      const pushSpy = jest.spyOn(binanceWebSocketService.connectionQueue, 'push');
      
      // Act
      const promise = binanceWebSocketService.connectToCombinedStreams(streamNames, onMessageCallback);
      
      // Assert
      expect(pushSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'combined',
          streamName: 'btcusdt@trade/ethusdt@trade',
          originalStreamNames: streamNames,
          onMessageCallback,
          resolver: expect.any(Function),
          rejecter: expect.any(Function)
        })
      );
      
      // Manually resolve the connection to complete the test
      binanceWebSocketService.connectionQueue[0].resolver(true);
      const result = await promise;
      expect(result).toBe(true);
    });
    
    it('should split streams into groups when exceeding maximum per connection', async () => {
      // Arrange
      const streamNames = ['stream1', 'stream2', 'stream3', 'stream4', 'stream5', 'stream6'];
      const maxStreamsPerConnection = config.websocket.maxStreamsPerConnection;
      const onMessageCallback = jest.fn();
      const pushSpy = jest.spyOn(binanceWebSocketService.connectionQueue, 'push');
      
      // Act
      const promise = binanceWebSocketService.connectToCombinedStreams(streamNames, onMessageCallback);
      
      // Assert
      expect(pushSpy).toHaveBeenCalledTimes(2);  // Two groups
      
      // First group should contain maxStreamsPerConnection streams
      expect(pushSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'combined',
          streamName: expect.stringContaining('group0_'),
          originalStreamNames: streamNames.slice(0, maxStreamsPerConnection),
          onMessageCallback
        })
      );
      
      // Second group should contain remaining streams
      expect(pushSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'combined',
          streamName: expect.stringContaining('group1_'),
          originalStreamNames: streamNames.slice(maxStreamsPerConnection),
          onMessageCallback
        })
      );
      
      // Manually resolve both connections to complete the test
      binanceWebSocketService.connectionQueue[0].resolver(true);
      binanceWebSocketService.connectionQueue[1].resolver(true);
      
      const result = await promise;
      expect(result).toBe(true);
    });
    
    it('should handle connection errors gracefully', async () => {
      // Arrange
      const streamNames = ['btcusdt@trade', 'ethusdt@trade'];
      const onMessageCallback = jest.fn();
      
      // Simulate an error during queue handling
      jest.spyOn(binanceWebSocketService.connectionQueue, 'push').mockImplementation(() => {
        throw new Error('Queue error');
      });
      
      // Act
      const result = await binanceWebSocketService.connectToCombinedStreams(streamNames, onMessageCallback);
      
      // Assert
      expect(result).toBe(false);
    });
  });

  describe('connectToWebSocketAPI', () => {
    it('should return existing connection if available and healthy', async () => {
      // Arrange
      const wsApiName = 'binance-ws-api';
      const existingWs = { readyState: WebSocket.OPEN };
      
      binanceWebSocketService.connections.set(wsApiName, {
        ws: existingWs,
        isAlive: true
      });
      
      // Act
      const result = await binanceWebSocketService.connectToWebSocketAPI();
      
      // Assert
      expect(result).toBe(existingWs);
    });
    
    it('should queue a WebSocket API connection request if no connection exists', async () => {
      // Arrange
      const wsApiName = 'binance-ws-api';
      const pushSpy = jest.spyOn(binanceWebSocketService.connectionQueue, 'push');
      
      // Act
      const promise = binanceWebSocketService.connectToWebSocketAPI();
      
      // Assert
      expect(pushSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'api',
          streamName: wsApiName,
          resolver: expect.any(Function),
          rejecter: expect.any(Function)
        })
      );
      
      // Manually resolve the connection to complete the test
      binanceWebSocketService.connections.set(wsApiName, {
        ws: mockWsInstance,
        isAlive: true
      });
      
      binanceWebSocketService.connectionQueue[0].resolver(mockWsInstance);
      const result = await promise;
      expect(result).toBe(mockWsInstance);
    });
    
    it('should handle connection errors and propagate them', async () => {
      // Arrange
      const errorMessage = 'WebSocket API connection error';
      
      // Simulate an error during queue handling
      jest.spyOn(binanceWebSocketService.connectionQueue, 'push').mockImplementation(() => {
        throw new Error(errorMessage);
      });
      
      // Act & Assert
      await expect(binanceWebSocketService.connectToWebSocketAPI()).rejects.toThrow(errorMessage);
    });
  });

  describe('Enhanced parallel connection queue processing', () => {
    it('should process multiple connections in parallel efficiently', async () => {
      // Arrange
      const maxParallel = 3;
      binanceWebSocketService.maxConcurrentConnections = maxParallel;
      
      // Create a set of 6 tasks (2 batches worth)
      const taskTypes = ['single', 'combined', 'api', 'single', 'combined', 'single'];
      const streamNames = ['btcusdt', 'eth/xrp', 'binance-ws-api', 'dogeusdt', 'sol/avax', 'adausdt'];
      
      // Add tasks to the queue
      for (let i = 0; i < taskTypes.length; i++) {
        binanceWebSocketService.connectionQueue.push({
          type: taskTypes[i],
          streamName: streamNames[i],
          onMessageCallback: i % 2 === 0 ? jest.fn() : undefined, // Add callbacks to some tasks
          resolver: jest.fn(),
          rejecter: jest.fn()
        });
      }
      
      // Mock the connection creation function to track calls and return success
      const createWsSpy = jest.spyOn(binanceWebSocketService, '_createAndManageWebSocket')
        .mockImplementation(async (url, name) => {
          // Wait a small amount to simulate real async behavior
          await new Promise(resolve => setTimeout(resolve, 5));
          return true;
        });
        
      // Mock setImmediate to be able to process the next batch
      const originalSetImmediate = global.setImmediate;
      let setImmediateCallback = null;
      global.setImmediate = jest.fn(callback => {
        setImmediateCallback = callback;
      });
      
      // Act - Process first batch
      const processPromise = binanceWebSocketService.processConnectionQueue();
      
      // Let the queue processing run
      await processPromise;
      
      // Assert - First batch
      expect(createWsSpy).toHaveBeenCalledTimes(maxParallel);
      expect(binanceWebSocketService.connectionQueue.length).toBe(taskTypes.length - maxParallel);
      
      // Act - Process second batch by triggering the setImmediate callback
      if (setImmediateCallback) {
        setImmediateCallback();
      }
      
      // Assert - All tasks should now be processed
      expect(createWsSpy).toHaveBeenCalledTimes(taskTypes.length);
      expect(binanceWebSocketService.connectionQueue.length).toBe(0);
      
      // Restore original setImmediate
      global.setImmediate = originalSetImmediate;
    });
    
    it('should handle task errors without stopping the queue processing', async () => {
      // Arrange
      binanceWebSocketService.maxConcurrentConnections = 3;
      
      // Create one task that will succeed and one that will fail
      const successTask = {
        type: 'single',
        streamName: 'success-stream',
        resolver: jest.fn(),
        rejecter: jest.fn()
      };
      
      const failTask = {
        type: 'single',
        streamName: 'fail-stream',
        resolver: jest.fn(),
        rejecter: jest.fn()
      };
      
      binanceWebSocketService.connectionQueue.push(successTask, failTask);
      
      // Mock the connection creation function
      jest.spyOn(binanceWebSocketService, '_createAndManageWebSocket')
        .mockImplementation(async (url, name) => {
          if (name === 'success-stream') {
            return true;
          } else {
            throw new Error('Simulated connection failure');
          }
        });
        
      // Act
      await binanceWebSocketService.processConnectionQueue();
      
      // Assert
      expect(successTask.resolver).toHaveBeenCalledWith(true);
      expect(failTask.rejecter).toHaveBeenCalled();
      expect(binanceWebSocketService.isProcessingQueue).toBe(false);
    });
  });

  describe('Integration tests for complete WebSocket lifecycle', () => {
    it('should handle the complete lifecycle from connection to disconnection', async () => {
      // Arrange - restore normal behavior
      jest.clearAllMocks();
      
      // Create a mock WebSocket instance with better event handling
      const mockEvents = {};
      mockWsInstance = {
        on: jest.fn((event, callback) => {
          mockEvents[event] = mockEvents[event] || [];
          mockEvents[event].push(callback);
          return mockWsInstance;
        }),
        once: jest.fn((event, callback) => {
          mockEvents[event] = mockEvents[event] || [];
          mockEvents[event].push(callback);
          return mockWsInstance;
        }),
        send: jest.fn(),
        ping: jest.fn(),
        close: jest.fn(),
        terminate: jest.fn(),
        readyState: WebSocket.OPEN
      };
      
      // Set up WebSocket constructor mock
      WebSocket.mockImplementation(() => mockWsInstance);
      
      // Mock event emitter
      const emitSpy = jest.spyOn(binanceWebSocketService, 'emit');
      
      // Set up test data
      const streamName = 'btcusdt@trade';
      const onMessageCallback = jest.fn();
      
      // Act - Connect to a stream
      const connectionPromise = binanceWebSocketService.connectToStream(streamName, onMessageCallback);
      
      // Trigger connection events in sequence
      if (mockEvents.open && mockEvents.open.length > 0) {
        // Simulate WebSocket connection opening
        mockEvents.open.forEach(handler => handler());
      }
      
      // Wait for connection to complete
      const result = await connectionPromise;
      
      // Assert - Connection established
      expect(result).toBe(true);
      expect(binanceWebSocketService.connections.has(streamName)).toBe(true);
      expect(binanceWebSocketService.streamCallbacks.get(streamName)).toContain(onMessageCallback);
      expect(emitSpy).toHaveBeenCalledWith('connected', streamName);
      
      // Act - Simulate receiving data
      const mockData = JSON.stringify({ price: 50000, symbol: 'BTCUSDT' });
      if (mockEvents.message && mockEvents.message.length > 0) {
        mockEvents.message.forEach(handler => handler(mockData));
      }
      
      // Assert - Message received and callback triggered
      expect(onMessageCallback).toHaveBeenCalledWith({ price: 50000, symbol: 'BTCUSDT' });
      expect(emitSpy).toHaveBeenCalledWith('message', streamName, { price: 50000, symbol: 'BTCUSDT' });
      
      // Act - Keep alive with pong
      binanceWebSocketService.connections.get(streamName).isAlive = false;
      if (mockEvents.pong && mockEvents.pong.length > 0) {
        mockEvents.pong.forEach(handler => handler());
      }
      
      // Assert - Connection marked alive after pong
      expect(binanceWebSocketService.connections.get(streamName).isAlive).toBe(true);
      
      // Act - Disconnect from the stream
      binanceWebSocketService.disconnect(streamName);
      
      // Assert - Properly disconnected
      expect(mockWsInstance.close).toHaveBeenCalled();
      expect(binanceWebSocketService.connections.has(streamName)).toBe(false);
      expect(binanceWebSocketService.streamCallbacks.has(streamName)).toBe(false);
    });
    
    it('should handle WebSocket API connection flow', async () => {
      // Arrange
      jest.clearAllMocks();
      mockWsInstance.readyState = WebSocket.OPEN;
      
      // Set up WebSocket constructor mock
      WebSocket.mockImplementation(() => mockWsInstance);
      
      // Mock event handlers to trigger open event
      mockWsInstance.on.mockImplementation((event, callback) => {
        if (event === 'open') {
          // Simulate WebSocket open event
          setTimeout(() => callback(), 0);
        }
        return mockWsInstance;
      });
      
      // Act - Connect to WebSocket API
      const wsPromise = binanceWebSocketService.connectToWebSocketAPI();
      
      // Fast-forward timers to trigger the open event
      jest.runAllTimers();
      
      // Wait for API connection
      const wsConnection = await wsPromise;
      
      // Assert - Connection returned
      expect(wsConnection).toBe(mockWsInstance);
      expect(binanceWebSocketService.connections.has('binance-ws-api')).toBe(true);
      
      // Verify correct URL
      expect(WebSocket).toHaveBeenCalledWith('wss://ws-api.binance.com/ws-api/v3');
    });
  });
});

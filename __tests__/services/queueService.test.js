/**
 * Unit tests for Queue Service functionality
 */
const Queue = require('bull');
const config = require('../../src/config');
const logger = require('../../src/utils/logger');

// Setup mock Queue implementation
const mockQueueImplementation = {
  process: jest.fn(),
  add: jest.fn().mockResolvedValue({}),
  removeRepeatable: jest.fn().mockResolvedValue({}),
  isReady: jest.fn().mockResolvedValue(true),
  on: jest.fn(),
  close: jest.fn().mockResolvedValue({})
};

// Mock dependencies
jest.mock('bull', () => jest.fn(() => mockQueueImplementation));
jest.mock('../../src/config', () => ({
  redis: { url: 'redis://localhost:6379' },
  queue: { concurrency: 2, websocketConcurrency: 5 },
  alerts: { checkInterval: 60000 }
}));
jest.mock('../../src/utils/logger', () => ({
  createModuleLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }))
}));
jest.mock('../../src/services/alertService', () => ({
  checkAllAlerts: jest.fn()
}));
jest.mock('../../src/services/priceService', () => ({
  getPrice: jest.fn()
}));
jest.mock('../../src/services/binancePriceStreamService', () => ({
  subscribeWithStaggeredBatches: jest.fn(),
  subscribeToMultipleTickerStream: jest.fn(),
  unsubscribeFromPriceUpdates: jest.fn(),
  getConnectionStatus: jest.fn()
}));

describe('Queue Service', () => {
  let queueService;
    beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Require the module under test (must be done after clearing mocks)
    jest.resetModules();
    queueService = require('../../src/services/queueService');
  });
  
  describe('scheduleAlertChecks', () => {
    beforeEach(() => {
      // Mock getRepeatableJobs
      mockQueueImplementation.getRepeatableJobs = jest.fn().mockResolvedValue([
        { id: 'regularAlertCheck', every: 60000 }
      ]);
    });

    it('should check and remove existing repeatable alert jobs before adding new ones', async () => {
      // Act
      await queueService.scheduleAlertChecks();
      
      // Assert
      expect(mockQueueImplementation.getRepeatableJobs).toHaveBeenCalled();
      expect(mockQueueImplementation.removeRepeatable).toHaveBeenCalledWith({
        jobId: 'regularAlertCheck',
        repeat: { every: 60000 }
      });
      expect(mockQueueImplementation.add).toHaveBeenCalledWith(
        {},
        {
          repeat: { every: 60000 },
          jobId: 'regularAlertCheck'
        }
      );
    });
    
    it('should handle case when there are no existing repeatable jobs', async () => {
      // Arrange
      mockQueueImplementation.getRepeatableJobs.mockResolvedValueOnce([]);
      
      // Act
      await queueService.scheduleAlertChecks();
      
      // Assert
      expect(mockQueueImplementation.getRepeatableJobs).toHaveBeenCalled();
      expect(mockQueueImplementation.removeRepeatable).not.toHaveBeenCalled();
      expect(mockQueueImplementation.add).toHaveBeenCalledWith(
        {},
        {
          repeat: { every: 60000 },
          jobId: 'regularAlertCheck'
        }
      );
    });

    it('should handle error when retrieving repeatable alert checks', async () => {
      // Arrange
      mockQueueImplementation.getRepeatableJobs.mockRejectedValueOnce(new Error('Test error'));
      
      // Act
      await queueService.scheduleAlertChecks();
      
      // Assert
      expect(mockQueueImplementation.add).toHaveBeenCalled();
      // It should continue execution despite the error
    });
    
    it('should create a one-time job if adding repeatable job fails', async () => {
      // Arrange
      mockQueueImplementation.add.mockRejectedValueOnce(new Error('Test error'));
      mockQueueImplementation.add.mockResolvedValueOnce({});
      
      // Act
      await queueService.scheduleAlertChecks();
      
      // Assert
      expect(mockQueueImplementation.add).toHaveBeenCalledTimes(2);
      expect(mockQueueImplementation.add).toHaveBeenLastCalledWith(
        {},
        { jobId: 'oneTimeAlertCheck' }
      );
    });
  });
  
  describe('schedulePopularPriceUpdates', () => {
    beforeEach(() => {
      // Mock getRepeatableJobs
      mockQueueImplementation.getRepeatableJobs = jest.fn().mockResolvedValue([
        { id: 'popularCoins', every: 60000 }
      ]);
    });

    it('should check and remove existing repeatable price update jobs before adding new ones', async () => {
      // Arrange
      const defaultSymbols = ['BTC', 'ETH', 'USDT', 'BNB', 'SOL'];
      
      // Act
      await queueService.schedulePopularPriceUpdates();
      
      // Assert
      expect(mockQueueImplementation.getRepeatableJobs).toHaveBeenCalled();
      expect(mockQueueImplementation.removeRepeatable).toHaveBeenCalledWith({
        jobId: 'popularCoins',
        repeat: { every: 60000 }
      });
      expect(mockQueueImplementation.add).toHaveBeenCalledWith(
        { symbols: defaultSymbols },
        {
          repeat: { every: 60000 },
          jobId: 'popularCoins'
        }
      );
    });
    
    it('should handle case when there are no existing repeatable jobs', async () => {
      // Arrange
      mockQueueImplementation.getRepeatableJobs.mockResolvedValueOnce([]);
      
      // Act
      await queueService.schedulePopularPriceUpdates();
      
      // Assert
      expect(mockQueueImplementation.getRepeatableJobs).toHaveBeenCalled();
      expect(mockQueueImplementation.removeRepeatable).not.toHaveBeenCalled();
    });

    it('should handle error when retrieving repeatable price updates', async () => {
      // Arrange
      mockQueueImplementation.getRepeatableJobs.mockRejectedValueOnce(new Error('Test error'));
      
      // Act
      await queueService.schedulePopularPriceUpdates();
      
      // Assert
      expect(mockQueueImplementation.add).toHaveBeenCalled();
      // It should continue execution despite the error
    });
    
    it('should create a one-time job if adding repeatable job fails', async () => {
      // Arrange
      mockQueueImplementation.add.mockRejectedValueOnce(new Error('Test error'));
      mockQueueImplementation.add.mockResolvedValueOnce({});
      
      // Act
      await queueService.schedulePopularPriceUpdates();
      
      // Assert
      expect(mockQueueImplementation.add).toHaveBeenCalledTimes(2);
      expect(mockQueueImplementation.add).toHaveBeenLastCalledWith(
        { symbols: ['BTC', 'ETH', 'USDT', 'BNB', 'SOL'] },
        { jobId: 'oneTimePopularCoins' }
      );
    });
    
    it('should use custom symbols when provided', async () => {
      // Arrange
      const customSymbols = ['BTC', 'ETH', 'DOGE'];
      
      // Act
      await queueService.schedulePopularPriceUpdates(customSymbols);
      
      // Assert
      expect(mockQueueImplementation.add).toHaveBeenCalledWith(
        { symbols: customSymbols },
        {
          repeat: { every: 60000 },
          jobId: 'popularCoins'
        }
      );
    });
  });
  
  describe('initializeQueues', () => {
    it('should initialize all queues and schedule jobs', async () => {
      // Act
      await queueService.initializeQueues();
      
      // Assert
      expect(mockQueueImplementation.isReady).toHaveBeenCalledTimes(3);
      expect(mockQueueImplementation.on).toHaveBeenCalledWith('completed', expect.any(Function));
      expect(mockQueueImplementation.on).toHaveBeenCalledWith('failed', expect.any(Function));
      expect(mockQueueImplementation.on).toHaveBeenCalledWith('stalled', expect.any(Function));
    });
    
    it('should handle errors during initialization', async () => {
      // Arrange
      mockQueueImplementation.isReady.mockRejectedValueOnce(new Error('Connection error'));
      
      // Act & Assert
      await expect(queueService.initializeQueues()).rejects.toThrow('Connection error');
    });
  });
});

/**
 * บริการ WebSocket สำหรับ Binance
 * จัดการการเชื่อมต่อ WebSocket กับ Binance API เพื่อรับข้อมูลแบบเรียลไทม์
 */

const WebSocket = require('ws');
const EventEmitter = require('events');
const logger = require('../utils/logger').createModuleLogger('BinanceWebSocketService');
const config = require('../config');

/**
 * คลาสจัดการการเชื่อมต่อ WebSocket กับ Binance
 * สามารถสร้างการเชื่อมต่อหลายการเชื่อมต่อพร้อมกันได้
 */
class BinanceWebSocketManager extends EventEmitter {  
  /**
   * สร้าง BinanceWebSocketManager
   */
  constructor() {
    super();
    // แฮชแมปของการเชื่อมต่อ WebSocket ที่ใช้งานอยู่
    // key: streamName, value: { ws: WebSocket, isAlive: boolean, pingInterval: Interval }
    this.connections = new Map();
    
    // ตั้งค่า URLs
    this.baseWsUrl = config.cryptoApis.binance.wsUrl || 'wss://stream.binance.com:9443/ws';
    this.combinedBaseUrl = 'wss://stream.binance.com:9443/stream?streams=';
    
    // URL สำหรับ API WebSocket
    this.apiWsUrl = 'wss://ws-api.binance.com/ws-api/v3';

    // ตั้งค่าจำนวนครั้งสูงสุดในการลองเชื่อมต่อใหม่
    this.maxReconnectAttempts = config.websocket.reconnectAttempts || 5;
    this.reconnectInterval = config.websocket.reconnectInterval || 5000; // 5 วินาที
    
    // แฮชแมปเพื่อเก็บ callback functions สำหรับ streams ต่างๆ
    this.streamCallbacks = new Map();
    
    // จำนวน connections พร้อมกันสูงสุด (สำหรับการเชื่อมต่อพร้อมกัน)
    this.maxConcurrentConnections = config.websocket.maxConnections || 50;
    
    // คิวงานสำหรับการเชื่อมต่อ
    this.connectionQueue = [];
    
    // สถานะการประมวลผล
    this.isProcessingQueue = false;
    
    // ตั้งเวลาสำหรับการตรวจสอบการเชื่อมต่อเป็นประจำ
    this.monitorInterval = null;
    
    // เริ่มระบบตรวจสอบการเชื่อมต่อ
    this.startConnectionMonitoring();
  }

  /**
   * เริ่มการตรวจสอบการเชื่อมต่อเป็นประจำ
   */
  startConnectionMonitoring() {
    // เคลียร์ timer เก่าถ้ามี
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }
    
    // ตั้งเวลาทำงานทุก 30 วินาที
    this.monitorInterval = setInterval(async () => {
      try {
        const unhealthyCount = await this.monitorConnections();
        if (unhealthyCount > 0) {
          logger.info(`Connection monitoring: Fixed ${unhealthyCount} unhealthy connections`);
        }
      } catch (error) {
        logger.error('Error in connection monitoring cycle:', error);
      }
    }, 30000);
    
    logger.info('WebSocket connection monitoring started');
  }
  
  /**
   * หยุดการตรวจสอบการเชื่อมต่อ
   */
  stopConnectionMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
      logger.info('WebSocket connection monitoring stopped');
    }
  }

  /**
   * เชื่อมต่อกับ stream เดี่ยว
   * @param {string} streamName - ชื่อของ stream ที่ต้องการเชื่อมต่อ
   * @param {function} onMessageCallback - ฟังก์ชันที่จะเรียกเมื่อได้รับข้อมูล
   * @returns {Promise<boolean>} - สถานะการเชื่อมต่อ
   */
  async connectToStream(streamName, onMessageCallback) {
    try {
      // ตรวจสอบว่าเชื่อมต่อกับ stream นี้อยู่แล้วหรือไม่
      if (this.connections.has(streamName)) {
        logger.info(`Already connected to stream: ${streamName}`);
        
        // เพิ่ม callback ใหม่สำหรับ stream นี้
        if (onMessageCallback) {
          if (!this.streamCallbacks.has(streamName)) {
            this.streamCallbacks.set(streamName, []);
          }
          this.streamCallbacks.get(streamName).push(onMessageCallback);
        }
        
        return true;
      }
      
      // เพิ่มงานในคิวการเชื่อมต่อเพื่อทำงานพร้อมกัน
      return new Promise((resolve, reject) => {
        this.connectionQueue.push({
          streamName,
          onMessageCallback,
          resolver: resolve,
          rejecter: reject
        });
        
        // เริ่มประมวลผลคิวการเชื่อมต่อ (ถ้ายังไม่มีการประมวลผล)
        if (!this.isProcessingQueue) {
          this.processConnectionQueue();
        }
      });
    } catch (error) {
      logger.error(`Error connecting to stream ${streamName}:`, error);
      return false;
    }
  }
  /**
   * เชื่อมต่อกับหลาย streams พร้อมกัน โดยใช้ combined stream
   * @param {Array<string>} streamNames - รายชื่อ streams ที่ต้องการเชื่อมต่อ
   * @param {function} onMessageCallback - ฟังก์ชันที่จะเรียกเมื่อได้รับข้อมูล
   * @returns {Promise<boolean>} - สถานะการเชื่อมต่อ
   */
  async connectToCombinedStreams(streamNames, onMessageCallback) {
    try {
      const combinedStreamName = streamNames.join('/');
      
      // ตรวจสอบว่าเชื่อมต่ออยู่แล้วหรือไม่
      if (this.connections.has(combinedStreamName)) {
        logger.info(`Already connected to combined stream: ${combinedStreamName}`);
        
        // เพิ่ม callback ใหม่
        if (onMessageCallback) {
          if (!this.streamCallbacks.has(combinedStreamName)) {
            this.streamCallbacks.set(combinedStreamName, []);
          }
          this.streamCallbacks.get(combinedStreamName).push(onMessageCallback);
        }
        
        return true;
      }
      
      // สำหรับเชื่อมต่อพร้อมกันจำนวนมาก: แบ่งเป็นกลุ่มย่อย
      const MAX_STREAMS_PER_CONNECTION = 25; // ค่าสูงสุดที่ Binance รองรับ
      
      if (streamNames.length > MAX_STREAMS_PER_CONNECTION) {
        logger.info(`Splitting ${streamNames.length} streams into multiple connections`);
        
        // แบ่งเป็นกลุ่มๆ ละไม่เกิน MAX_STREAMS_PER_CONNECTION
        const groups = [];
        for (let i = 0; i < streamNames.length; i += MAX_STREAMS_PER_CONNECTION) {
          groups.push(streamNames.slice(i, i + MAX_STREAMS_PER_CONNECTION));
        }
        
        // เชื่อมต่อแต่ละกลุ่มพร้อมกัน
        const results = await Promise.all(
          groups.map((group, index) => 
            this._connectToCombinedStreamsGroup(group, onMessageCallback, index)
          )
        );
        
        // ตรวจสอบว่าทุกกลุ่มเชื่อมต่อสำเร็จ
        return !results.includes(false);
      }
      
      // สร้าง URL สำหรับ combined stream
      const combinedUrl = `${this.combinedBaseUrl}${streamNames.join('/')}`;
      
      // สร้าง WebSocket connection
      const ws = new WebSocket(combinedUrl);
      let reconnectAttempts = 0;
      let pingInterval;
      
      // บันทึกการเชื่อมต่อ
      this.connections.set(combinedStreamName, {
        ws,
        isAlive: false,
        pingInterval: null,
        reconnectAttempts: 0
      });
      
      // บันทึก callback
      if (onMessageCallback) {
        this.streamCallbacks.set(combinedStreamName, [onMessageCallback]);
      } else {
        this.streamCallbacks.set(combinedStreamName, []);
      }
      
      // ตั้งค่า event handlers คล้ายกับ connectToStream
      ws.on('open', () => {
        logger.info(`Connected to combined streams: ${combinedStreamName}`);
        
        const connection = this.connections.get(combinedStreamName);
        connection.isAlive = true;
        reconnectAttempts = 0;
        
        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
          }
        }, 30000);
        
        connection.pingInterval = pingInterval;
        this.connections.set(combinedStreamName, connection);
        
        this.emit('connected', combinedStreamName);
      });
      
      ws.on('message', (data) => {
        try {
          const parsedData = JSON.parse(data);
          
          // เรียกใช้ callbacks
          const callbacks = this.streamCallbacks.get(combinedStreamName) || [];
          callbacks.forEach(callback => {
            try {
              callback(parsedData);
            } catch (callbackError) {
              logger.error(`Error in combined stream callback:`, callbackError);
            }
          });
          
          this.emit('message', combinedStreamName, parsedData);
        } catch (parseError) {
          logger.error(`Error parsing message from combined stream:`, parseError);
        }
      });
      
      // ตั้งค่า handlers สำหรับ error, close, และ pong เหมือนกับ connectToStream
      ws.on('pong', () => {
        const connection = this.connections.get(combinedStreamName);
        if (connection) {
          connection.isAlive = true;
          this.connections.set(combinedStreamName, connection);
        }
      });
      
      ws.on('error', (error) => {
        logger.error(`Combined WebSocket error:`, error);
        this.emit('error', combinedStreamName, error);
      });
      
      ws.on('close', async (code, reason) => {
        logger.warn(`Combined connection closed: ${code} - ${reason}`);
        
        const connection = this.connections.get(combinedStreamName);
        if (connection && connection.pingInterval) {
          clearInterval(connection.pingInterval);
        }
        
        this.emit('disconnected', combinedStreamName);
        
        if (reconnectAttempts < this.maxReconnectAttempts) {
          reconnectAttempts++;
          logger.info(`Attempting to reconnect to combined stream (${reconnectAttempts}/${this.maxReconnectAttempts})`);
          
          setTimeout(async () => {
            try {
              await this.connectToCombinedStreams(streamNames);
              logger.info(`Reconnected to combined stream`);
            } catch (reconnectError) {
              logger.error(`Failed to reconnect to combined stream:`, reconnectError);
            }
          }, this.reconnectInterval);
        } else {
          logger.error(`Max reconnect attempts reached for combined stream, giving up`);
          this.connections.delete(combinedStreamName);
        }
      });
      
      return new Promise((resolve) => {
        ws.once('open', () => resolve(true));
        ws.once('error', () => resolve(false));
      });
      
    } catch (error) {
      logger.error(`Error connecting to combined streams:`, error);
      return false;
    }
  }

  /**
   * เชื่อมต่อกับกลุ่มย่อยของ combined streams
   * @param {Array<string>} streamNames - รายชื่อ streams ในกลุ่ม
   * @param {function} onMessageCallback - ฟังก์ชันที่จะเรียกเมื่อได้รับข้อมูล
   * @param {number} groupIndex - ลำดับกลุ่ม
   * @returns {Promise<boolean>} - สถานะการเชื่อมต่อ
   * @private
   */
  async _connectToCombinedStreamsGroup(streamNames, onMessageCallback, groupIndex) {
    try {
      const combinedStreamName = `group${groupIndex}_${streamNames.join('/')}`;
      
      // ตรวจสอบว่าเชื่อมต่ออยู่แล้วหรือไม่
      if (this.connections.has(combinedStreamName)) {
        logger.info(`Already connected to combined stream group: ${combinedStreamName}`);
        
        // เพิ่ม callback ใหม่
        if (onMessageCallback) {
          if (!this.streamCallbacks.has(combinedStreamName)) {
            this.streamCallbacks.set(combinedStreamName, []);
          }
          this.streamCallbacks.get(combinedStreamName).push(onMessageCallback);
        }
        
        return true;
      }
      
      // สร้าง URL สำหรับ combined stream
      const combinedUrl = `${this.combinedBaseUrl}${streamNames.join('/')}`;
      
      // สร้าง WebSocket connection
      const ws = new WebSocket(combinedUrl);
      let reconnectAttempts = 0;
      let pingInterval;
      
      // บันทึกการเชื่อมต่อ
      this.connections.set(combinedStreamName, {
        ws,
        isAlive: false,
        pingInterval: null,
        reconnectAttempts: 0
      });
      
      // บันทึก callback
      if (onMessageCallback) {
        this.streamCallbacks.set(combinedStreamName, [onMessageCallback]);
      } else {
        this.streamCallbacks.set(combinedStreamName, []);
      }
      
      // ตั้งค่า event handlers คล้ายกับ connectToStream
      ws.on('open', () => {
        logger.info(`Connected to combined streams group ${groupIndex}: ${combinedStreamName}`);
        
        const connection = this.connections.get(combinedStreamName);
        connection.isAlive = true;
        reconnectAttempts = 0;
        
        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
          }
        }, 30000);
        
        connection.pingInterval = pingInterval;
        this.connections.set(combinedStreamName, connection);
        
        this.emit('connected', combinedStreamName);
      });
      
      ws.on('message', (data) => {
        try {
          const parsedData = JSON.parse(data);
          
          // เรียกใช้ callbacks
          const callbacks = this.streamCallbacks.get(combinedStreamName) || [];
          callbacks.forEach(callback => {
            try {
              callback(parsedData);
            } catch (callbackError) {
              logger.error(`Error in combined stream group callback:`, callbackError);
            }
          });
          
          this.emit('message', combinedStreamName, parsedData);
        } catch (parseError) {
          logger.error(`Error parsing message from combined stream group ${groupIndex}:`, parseError);
        }
      });
      
      // ตั้งค่า handlers สำหรับ error, close, และ pong
      ws.on('pong', () => {
        const connection = this.connections.get(combinedStreamName);
        if (connection) {
          connection.isAlive = true;
          this.connections.set(combinedStreamName, connection);
        }
      });
      
      ws.on('error', (error) => {
        logger.error(`Combined WebSocket error for group ${groupIndex}:`, error);
        this.emit('error', combinedStreamName, error);
      });
      
      ws.on('close', async (code, reason) => {
        logger.warn(`Combined connection closed for group ${groupIndex}: ${code} - ${reason}`);
        
        const connection = this.connections.get(combinedStreamName);
        if (connection && connection.pingInterval) {
          clearInterval(connection.pingInterval);
        }
        
        this.emit('disconnected', combinedStreamName);
        
        if (reconnectAttempts < this.maxReconnectAttempts) {
          reconnectAttempts++;
          logger.info(`Attempting to reconnect to combined stream group ${groupIndex} (${reconnectAttempts}/${this.maxReconnectAttempts})`);
          
          setTimeout(async () => {
            try {
              await this._connectToCombinedStreamsGroup(streamNames, onMessageCallback, groupIndex);
              logger.info(`Reconnected to combined stream group ${groupIndex}`);
            } catch (reconnectError) {
              logger.error(`Failed to reconnect to combined stream group ${groupIndex}:`, reconnectError);
            }
          }, this.reconnectInterval);
        } else {
          logger.error(`Max reconnect attempts reached for combined stream group ${groupIndex}, giving up`);
          this.connections.delete(combinedStreamName);
        }
      });
      
      return new Promise((resolve) => {
        ws.once('open', () => resolve(true));
        ws.once('error', () => resolve(false));
      });
      
    } catch (error) {
      logger.error(`Error connecting to combined streams group ${groupIndex}:`, error);
      return false;
    }
  }

  /**
   * เชื่อมต่อกับ WebSocket API ของ Binance
   * @param {string} requestId - ID ของคำขอ (ใช้สำหรับการติดตาม)
   * @returns {Promise<WebSocket>} - WebSocket connection
   */
  async connectToWebSocketAPI() {
    try {
      const wsApiName = 'binance-ws-api';
      
      // ตรวจสอบว่าเชื่อมต่ออยู่แล้วหรือไม่
      if (this.connections.has(wsApiName)) {
        const connection = this.connections.get(wsApiName);
        if (connection.isAlive && connection.ws.readyState === WebSocket.OPEN) {
          return connection.ws;
        } else {
          // ทำความสะอาดการเชื่อมต่อเก่า
          this.disconnect(wsApiName);
        }
      }
      
      // สร้าง WebSocket connection
      const ws = new WebSocket(this.apiWsUrl);
      let reconnectAttempts = 0;
      let pingInterval;
      
      // บันทึกการเชื่อมต่อ
      this.connections.set(wsApiName, {
        ws,
        isAlive: false,
        pingInterval: null,
        reconnectAttempts: 0
      });
      
      // ตั้งค่า event handlers
      ws.on('open', () => {
        logger.info('Connected to Binance WebSocket API');
        
        const connection = this.connections.get(wsApiName);
        connection.isAlive = true;
        reconnectAttempts = 0;
        
        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
          }
        }, 30000);
        
        connection.pingInterval = pingInterval;
        this.connections.set(wsApiName, connection);
        
        this.emit('api-connected');
      });
      
      ws.on('message', (data) => {
        try {
          const parsedData = JSON.parse(data);
          this.emit('api-message', parsedData);
        } catch (parseError) {
          logger.error('Error parsing message from WebSocket API:', parseError);
        }
      });
      
      ws.on('pong', () => {
        const connection = this.connections.get(wsApiName);
        if (connection) {
          connection.isAlive = true;
          this.connections.set(wsApiName, connection);
        }
      });
      
      ws.on('error', (error) => {
        logger.error('WebSocket API error:', error);
        this.emit('api-error', error);
      });
      
      ws.on('close', async (code, reason) => {
        logger.warn(`WebSocket API connection closed: ${code} - ${reason}`);
        
        const connection = this.connections.get(wsApiName);
        if (connection && connection.pingInterval) {
          clearInterval(connection.pingInterval);
        }
        
        this.emit('api-disconnected');
        
        if (reconnectAttempts < this.maxReconnectAttempts) {
          reconnectAttempts++;
          logger.info(`Attempting to reconnect to WebSocket API (${reconnectAttempts}/${this.maxReconnectAttempts})`);
          
          setTimeout(async () => {
            try {
              await this.connectToWebSocketAPI();
              logger.info('Reconnected to WebSocket API');
            } catch (reconnectError) {
              logger.error('Failed to reconnect to WebSocket API:', reconnectError);
            }
          }, this.reconnectInterval);
        } else {
          logger.error('Max reconnect attempts reached for WebSocket API, giving up');
          this.connections.delete(wsApiName);
        }
      });
      
      // รอให้การเชื่อมต่อเปิด
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('WebSocket API connection timeout'));
        }, 10000); // timeout 10 วินาที
        
        ws.once('open', () => {
          clearTimeout(timeout);
          resolve(ws);
        });
        
        ws.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
      
    } catch (error) {
      logger.error('Error connecting to WebSocket API:', error);
      throw error;
    }
  }

  /**
   * ส่งคำขอไปยัง WebSocket API
   * @param {object} request - คำขอที่จะส่ง
   * @returns {Promise<object>} - ผลลัพธ์จาก API
   */
  async sendApiRequest(request) {
    try {
      const ws = await this.connectToWebSocketAPI();
      
      return new Promise((resolve, reject) => {
        const requestId = request.id || `req_${Date.now()}`;
        const timeout = setTimeout(() => {
          this.removeListener('api-message', messageHandler);
          reject(new Error('WebSocket API request timeout'));
        }, 30000);
        
        const messageHandler = (data) => {
          if (data.id === requestId) {
            clearTimeout(timeout);
            this.removeListener('api-message', messageHandler);
            resolve(data);
          }
        };
        
        this.on('api-message', messageHandler);
        
        // เพิ่ม requestId ถ้าไม่มี
        const finalRequest = {
          ...request,
          id: requestId
        };
        
        ws.send(JSON.stringify(finalRequest));
      });
      
    } catch (error) {
      logger.error('Error sending WebSocket API request:', error);
      throw error;
    }
  }

  /**
   * ยกเลิกการเชื่อมต่อกับ stream เดียว
   * @param {string} streamName - ชื่อของ stream ที่ต้องการยกเลิกการเชื่อมต่อ
   */
  disconnect(streamName) {
    const connection = this.connections.get(streamName);
    if (connection) {
      logger.info(`Disconnecting from stream: ${streamName}`);
      
      if (connection.pingInterval) {
        clearInterval(connection.pingInterval);
      }
      
      if (connection.ws) {
        try {
          if (connection.ws.readyState === WebSocket.OPEN) {
            connection.ws.close();
          }
        } catch (error) {
          logger.error(`Error closing WebSocket for ${streamName}:`, error);
        }
      }
      
      this.connections.delete(streamName);
      this.streamCallbacks.delete(streamName);
    }
  }  /**
   * ยกเลิกการเชื่อมต่อทั้งหมด
   */
  disconnectAll() {
    logger.info('Disconnecting all WebSocket connections');
    
    // หยุดระบบตรวจสอบการเชื่อมต่อ
    this.stopConnectionMonitoring();
    
    // ล้างคิวงานการเชื่อมต่อที่รอดำเนินการ
    if (this.connectionQueue.length > 0) {
      logger.info(`Clearing connection queue with ${this.connectionQueue.length} pending connections`);
      
      // แจ้งเตือนงานที่รอดำเนินการว่าถูกยกเลิก
      this.connectionQueue.forEach(task => {
        try {
          task.rejecter(new Error('Connection request canceled - disconnecting all connections'));
        } catch (error) {
          // ไม่ต้องทำอะไร - แค่ให้แน่ใจว่าจะไม่มี errors ที่ไม่ได้จัดการ
        }
      });
      
      this.connectionQueue = [];
    }
    
    // ยกเลิกการเชื่อมต่อที่ใช้งานอยู่ทั้งหมด
    for (const [streamName, connection] of this.connections.entries()) {
      if (connection.pingInterval) {
        clearInterval(connection.pingInterval);
      }
      
      if (connection.ws) {
        try {
          if (connection.ws.readyState === WebSocket.OPEN || connection.ws.readyState === WebSocket.CONNECTING) {
            logger.debug(`Closing WebSocket connection: ${streamName}`);
            connection.ws.close();
          }
        } catch (error) {
          logger.error(`Error closing WebSocket for ${streamName}:`, error);
        }
      }
    }
    
    this.connections.clear();
    this.streamCallbacks.clear();
    this.isProcessingQueue = false;
    
    logger.info('All WebSocket connections have been disconnected');
  }

  /**
   * ตรวจสอบสถานะการเชื่อมต่อทั้งหมด
   * @returns {Object} - สถานะการเชื่อมต่อทั้งหมด
   */
  getConnectionStatus() {
    const status = {};
    
    for (const [streamName, connection] of this.connections.entries()) {
      status[streamName] = {
        isConnected: connection.isAlive,
        readyState: connection.ws ? connection.ws.readyState : 'closed',
        reconnectAttempts: connection.reconnectAttempts
      };
    }
    
    return status;
  }
  /**
   * ประมวลผลคิวการเชื่อมต่อเพื่อรองรับการเชื่อมต่อพร้อมกันหลายเชื่อมต่อ
   */
  async processConnectionQueue() {
    if (this.isProcessingQueue || this.connectionQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;
    
    try {
      // ดึงงานการเชื่อมต่อตามจำนวนที่กำหนด (ไม่เกิน maxConcurrentConnections)
      const currentBatch = this.connectionQueue.splice(0, this.maxConcurrentConnections);
      
      if (currentBatch.length > 0) {
        logger.info(`Processing ${currentBatch.length} WebSocket connections in parallel`);
        
        // ประมวลผลการเชื่อมต่อพร้อมกัน
        await Promise.all(currentBatch.map(async (task) => {
          try {
            const { streamName, onMessageCallback, resolver, rejecter } = task;
            
            // ตรวจสอบว่าเชื่อมต่อกับ stream นี้อยู่แล้วหรือไม่
            if (this.connections.has(streamName)) {
              logger.debug(`Already connected to stream: ${streamName}`);
              
              // เพิ่ม callback ใหม่สำหรับ stream นี้
              if (onMessageCallback) {
                if (!this.streamCallbacks.has(streamName)) {
                  this.streamCallbacks.set(streamName, []);
                }
                this.streamCallbacks.get(streamName).push(onMessageCallback);
              }
              
              resolver(true);
              return;
            }
            
            // ทำการเชื่อมต่อ
            const result = await this._performConnection(streamName, onMessageCallback);
            resolver(result);
          } catch (error) {
            // ตรวจสอบว่าเป็นข้อผิดพลาดเกี่ยวกับโควต้าหรือไม่
            if (error.message && (
                error.message.includes('quota') || 
                error.message.includes('limit') || 
                error.message.includes('too many') ||
                error.message.includes('rate limit')
            )) {
              // จัดการกับข้อผิดพลาดโควต้าเป็นพิเศษ
              this._handleQuotaExceededError(task.streamName, error);
              
              // ใส่งานกลับเข้าไปในคิวเพื่อให้ลองใหม่ภายหลัง
              this.connectionQueue.push(task);
            } else {
              logger.error(`Error in connection task: ${error.message}`);
              task.rejecter(error);
            }
          }
        }));
      }
    } catch (error) {
      logger.error(`Error processing connection queue: ${error.message}`);
    } finally {
      this.isProcessingQueue = false;
      
      // ตรวจสอบหากมีงานเหลือในคิว
      if (this.connectionQueue.length > 0) {
        // ประมวลผลงานถัดไปในคิวทันที (ถ้าเป็นไปได้)
        setImmediate(() => this.processConnectionQueue());
      }
    }
  }
  
  /**
   * ทำการเชื่อมต่อ WebSocket (ส่วนการทำงานภายใน)
   * @param {string} streamName - ชื่อของ stream ที่ต้องการเชื่อมต่อ
   * @param {function} onMessageCallback - ฟังก์ชันที่จะเรียกเมื่อได้รับข้อมูล
   * @returns {Promise<boolean>} - สถานะการเชื่อมต่อ
   * @private
   */
  async _performConnection(streamName, onMessageCallback) {
    try {
      // สร้าง WebSocket connection
      const ws = new WebSocket(`${this.baseWsUrl}/${streamName}`);
      let reconnectAttempts = 0;
      let pingInterval;
      
      // บันทึกการเชื่อมต่อ
      this.connections.set(streamName, { 
        ws,
        isAlive: false,
        pingInterval: null,
        reconnectAttempts: 0
      });
      
      // บันทึก callback
      if (onMessageCallback) {
        this.streamCallbacks.set(streamName, [onMessageCallback]);
      } else {
        this.streamCallbacks.set(streamName, []);
      }
      
      // ตั้งค่า event handlers
      ws.on('open', () => {
        logger.info(`Connected to Binance stream: ${streamName}`);
        
        const connection = this.connections.get(streamName);
        connection.isAlive = true;
        reconnectAttempts = 0;
        
        // ตั้งเวลาส่ง ping เป็นประจำเพื่อตรวจสอบการเชื่อมต่อ
        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
          }
        }, 30000); // ส่ง ping ทุก 30 วินาที
        
        connection.pingInterval = pingInterval;
        this.connections.set(streamName, connection);
        
        // ส่งสัญญาณว่าเชื่อมต่อแล้ว
        this.emit('connected', streamName);
      });
      
      ws.on('message', (data) => {
        try {
          const parsedData = JSON.parse(data);
          
          // เรียกใช้ callbacks ทั้งหมดสำหรับ stream นี้
          const callbacks = this.streamCallbacks.get(streamName) || [];
          callbacks.forEach(callback => {
            try {
              callback(parsedData);
            } catch (callbackError) {
              logger.error(`Error in stream callback for ${streamName}:`, callbackError);
            }
          });
          
          // ส่ง event
          this.emit('message', streamName, parsedData);
        } catch (parseError) {
          logger.error(`Error parsing message from ${streamName}:`, parseError);
        }
      });
      
      ws.on('pong', () => {
        const connection = this.connections.get(streamName);
        if (connection) {
          connection.isAlive = true;
          this.connections.set(streamName, connection);
        }
      });
      
      ws.on('error', (error) => {
        logger.error(`WebSocket error for ${streamName}:`, error);
        this.emit('error', streamName, error);
      });
      
      ws.on('close', async (code, reason) => {
        logger.warn(`Connection closed for ${streamName}: ${code} - ${reason}`);
        
        const connection = this.connections.get(streamName);
        if (connection && connection.pingInterval) {
          clearInterval(connection.pingInterval);
        }
        
        // แจ้งเตือนว่าการเชื่อมต่อถูกปิด
        this.emit('disconnected', streamName);
        
        // เชื่อมต่อใหม่ถ้าจำเป็น
        if (reconnectAttempts < this.maxReconnectAttempts) {
          reconnectAttempts++;
          logger.info(`Attempting to reconnect to ${streamName} (${reconnectAttempts}/${this.maxReconnectAttempts})`);
          
          setTimeout(async () => {
            try {
              await this.connectToStream(streamName);
              logger.info(`Reconnected to ${streamName}`);
            } catch (reconnectError) {
              logger.error(`Failed to reconnect to ${streamName}:`, reconnectError);
            }
          }, this.reconnectInterval);
        } else {
          logger.error(`Max reconnect attempts reached for ${streamName}, giving up`);
          this.connections.delete(streamName);
        }
      });
      
      return new Promise((resolve) => {
        ws.once('open', () => resolve(true));
        ws.once('error', () => resolve(false));
      });
      
    } catch (error) {
      logger.error(`Error connecting to stream ${streamName}:`, error);
      return false;
    }
  }

  /**
   * ปรับขนาดสระการเชื่อมต่อตามการใช้งาน
   * ช่วยเพิ่มหรือลดขนาด connection pool ตามความต้องการปัจจุบัน
   */
  async optimizeConnectionPool() {
    try {
      // วิเคราะห์จำนวนการเชื่อมต่อปัจจุบัน
      const currentConnections = this.connections.size;
      const maxConnections = config.websocket.maxConnections;
      const queueSize = this.connectionQueue.length;
      
      // ถ้ามีการเชื่อมต่อน้อยและมีคิวงานมาก อาจเพิ่มค่าพารามิเตอร์ maxConcurrentConnections
      if (currentConnections < maxConnections * 0.5 && queueSize > 10) {
        // เพิ่มขนาด pool เพื่อรองรับงานที่เข้ามา
        const newMaxConcurrent = Math.min(maxConnections, this.maxConcurrentConnections * 1.5);
        
        if (newMaxConcurrent > this.maxConcurrentConnections) {
          logger.info(`Scaling up connection pool: ${this.maxConcurrentConnections} -> ${newMaxConcurrent}`);
          this.maxConcurrentConnections = Math.floor(newMaxConcurrent);
        }
      }
      // ถ้าการใช้งาน connection pool น้อย อาจลดขนาดลงเพื่อประหยัดทรัพยากร
      else if (currentConnections < maxConnections * 0.2 && queueSize === 0 && this.maxConcurrentConnections > 20) {
        // ลดขนาด pool ลงช้าๆ
        const newMaxConcurrent = Math.max(20, this.maxConcurrentConnections * 0.8);
        
        if (newMaxConcurrent < this.maxConcurrentConnections) {
          logger.info(`Scaling down connection pool: ${this.maxConcurrentConnections} -> ${newMaxConcurrent}`);
          this.maxConcurrentConnections = Math.floor(newMaxConcurrent);
        }
      }
      
      return {
        currentConnections,
        maxConcurrentConnections: this.maxConcurrentConnections,
        queueSize
      };
    } catch (error) {
      logger.error('Error optimizing connection pool:', error);
      return null;
    }
  }
  
  /**
   * ตรวจสอบและทดสอบการเชื่อมต่อทั้งหมดเป็นระยะ
   * ทำการทดสอบสุขภาพของการเชื่อมต่อแต่ละรายการ
   */
  async monitorConnections() {
    try {
      const unhealthyConnections = [];
      
      for (const [streamName, connection] of this.connections.entries()) {
        if (!connection.isAlive && connection.ws.readyState !== WebSocket.OPEN) {
          unhealthyConnections.push(streamName);
        }
      }
      
      // ถ้ามีการเชื่อมต่อที่มีปัญหา ให้ลองเชื่อมต่อใหม่
      if (unhealthyConnections.length > 0) {
        logger.warn(`Found ${unhealthyConnections.length} unhealthy connections, attempting to reconnect`);
        
        // ลองเชื่อมต่อใหม่ทีละการเชื่อมต่อ (ไม่พร้อมกันทั้งหมดเพื่อไม่ให้เกิดการใช้ทรัพยากรมากเกินไป)
        for (const streamName of unhealthyConnections) {
          // ตรวจสอบประเภทของ stream และทำการเชื่อมต่อใหม่ตามประเภท
          if (streamName.includes('/')) {
            // เป็น combined stream ให้ลองใช้วิธีเชื่อมต่อใหม่ตามที่เหมาะสม
            const streamParts = streamName.split('/');
            
            // ถ้าเป็นกลุ่มให้ตัดส่วน 'groupX_' ออกก่อน (ถ้ามี)
            const normalizedParts = streamParts.map(part => {
              if (part.startsWith('group') && part.includes('_')) {
                return part.split('_')[1];
              }
              return part;
            });
            
            // เชื่อมต่อใหม่
            this.disconnect(streamName);
            await this.connectToCombinedStreams(normalizedParts);
          } else {
            // เป็น stream เดี่ยว
            this.disconnect(streamName);
            await this.connectToStream(streamName);
          }
        }
      }
      
      // วิเคราะห์และปรับขนาดสระการเชื่อมต่อ
      await this.optimizeConnectionPool();
      
      return unhealthyConnections.length;
    } catch (error) {
      logger.error('Error monitoring connections:', error);
      return -1;
    }
  }

  /**
   * จัดการกับข้อผิดพลาดเกี่ยวกับโควต้าที่เกินขีดจำกัด
   * @param {string} streamName - ชื่อของ stream ที่มีปัญหา
   * @param {Error} error - ข้อความแสดงข้อผิดพลาด
   * @private
   */
  _handleQuotaExceededError(streamName, error) {
    logger.warn(`Quota exceeded for ${streamName}, implementing backoff strategy`);
    
    // ลดขนาดสระการเชื่อมต่อลงชั่วคราวเพื่อจัดการกับข้อจำกัดโควต้า
    this.maxConcurrentConnections = Math.max(5, Math.floor(this.maxConcurrentConnections * 0.5));
    
    // รอเวลานานขึ้นก่อนลองอีกครั้ง
    const backoffTime = Math.floor(Math.random() * 30000) + 30000; // 30-60 วินาที
    
    logger.info(`Adjusted connection pool size to ${this.maxConcurrentConnections}, backing off for ${backoffTime/1000}s`);
    
    // หยุดประมวลผลคิวชั่วคราว
    this.isProcessingQueue = false;
    
    // ลองประมวลผลคิวอีกครั้งหลังจากรอ
    setTimeout(() => {
      logger.info('Resuming connection queue processing after backoff');
      
      // คืนค่าขนาดสระการเชื่อมต่อให้เป็นค่าเริ่มต้น
      this.maxConcurrentConnections = config.websocket.maxConnections || 50;
      
      // ลองประมวลผลคิวอีกครั้ง
      this.processConnectionQueue();
    }, backoffTime);
  }
}

// สร้าง instance เดียวของ Manager
const binanceWebSocketManager = new BinanceWebSocketManager();

module.exports = binanceWebSocketManager;

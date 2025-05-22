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
   * สร้างและจัดการการเชื่อมต่อ WebSocket
   * @param {string} url - URL ของ WebSocket
   * @param {string} streamName - ชื่อของ stream
   * @param {function} [onMessageCallback] - ฟังก์ชันที่จะเรียกเมื่อได้รับข้อมูล
   * @returns {Promise<boolean>} - สถานะการเชื่อมต่อ
   * @private
   */
  async _createAndManageWebSocket(url, streamName, onMessageCallback) {
    try {
      // ตรวจสอบว่าเชื่อมต่อกับ stream นี้อยู่แล้วหรือไม่
      if (this.connections.has(streamName)) {
        logger.info(`Already connected to stream: ${streamName}`);
        if (onMessageCallback) {
          if (!this.streamCallbacks.has(streamName)) {
            this.streamCallbacks.set(streamName, []);
          }
          this.streamCallbacks.get(streamName).push(onMessageCallback);
        }
        return true;
      }

      const ws = new WebSocket(url);
      let reconnectAttempts = 0;
      let pingInterval;

      this.connections.set(streamName, {
        ws,
        isAlive: false,
        pingInterval: null,
        reconnectAttempts: 0,
      });

      if (onMessageCallback) {
        this.streamCallbacks.set(streamName, [onMessageCallback]);
      } else {
        this.streamCallbacks.set(streamName, []);
      }

      return new Promise((resolve, reject) => {
        ws.on('open', () => {
          logger.info(`Connected to ${streamName}`);
          const connection = this.connections.get(streamName);
          if (connection) {
            connection.isAlive = true;
            connection.reconnectAttempts = 0; // Reset on successful connection
            pingInterval = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.ping();
              }
            }, 30000);
            connection.pingInterval = pingInterval;
            this.connections.set(streamName, connection);
          }
          this.emit('connected', streamName);
          resolve(true);
        });

        ws.on('message', (data) => {
          try {
            const parsedData = JSON.parse(data);
            const callbacks = this.streamCallbacks.get(streamName) || [];
            callbacks.forEach(callback => {
              try {
                callback(parsedData);
              } catch (callbackError) {
                logger.error(`Error in stream callback for ${streamName}:`, callbackError);
              }
            });
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
          logger.warn(`Connection closed for ${streamName}: ${code} - ${String(reason)}`);
          const connection = this.connections.get(streamName);
          if (connection && connection.pingInterval) {
            clearInterval(connection.pingInterval);
          }
          this.emit('disconnected', streamName);

          if (connection) {
            reconnectAttempts = connection.reconnectAttempts || 0;
            if (reconnectAttempts < this.maxReconnectAttempts) {
              reconnectAttempts++;
              connection.reconnectAttempts = reconnectAttempts;
              this.connections.set(streamName, connection);

              logger.info(`Attempting to reconnect to ${streamName} (${reconnectAttempts}/${this.maxReconnectAttempts})`);
              setTimeout(async () => {
                try {
                  if (streamName.startsWith('group') || streamName.includes('/')) {
                    const originalStreamNames = streamName.startsWith('group') ? streamName.substring(streamName.indexOf('_') + 1).split('/') : streamName.split('/');
                    await this._createAndManageWebSocket(`${this.combinedBaseUrl}${originalStreamNames.join('/')}`, streamName, onMessageCallback);
                  } else if (streamName === 'binance-ws-api') {
                    await this._createAndManageWebSocket(this.apiWsUrl, streamName, onMessageCallback);
                  } else {
                    await this._createAndManageWebSocket(`${this.baseWsUrl}/${streamName}`, streamName, onMessageCallback);
                  }
                  logger.info(`Reconnected to ${streamName}`);
                } catch (reconnectError) {
                  logger.error(`Failed to reconnect to ${streamName}:`, reconnectError);
                }
              }, this.reconnectInterval * Math.pow(2, reconnectAttempts - 1));
            } else {
              logger.error(`Max reconnect attempts reached for ${streamName}, giving up.`);
              this.connections.delete(streamName);
              this.streamCallbacks.delete(streamName);
              reject(new Error(`Max reconnect attempts reached for ${streamName}`));
            }
          } else {
            logger.warn(`Connection for ${streamName} not found during close event, possibly already cleaned up.`);
            reject(new Error(`Connection for ${streamName} not found during close`));
          }
        });

        const connectionTimeout = setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            logger.warn(`Initial connection attempt to ${streamName} timed out.`);
            ws.terminate();
            reject(new Error(`Connection attempt to ${streamName} timed out`));
          }
        }, config.websocket.connectionTimeout || 15000);

        ws.once('open', () => clearTimeout(connectionTimeout));
        ws.once('error', () => clearTimeout(connectionTimeout));
      });
    } catch (error) {
      logger.error(`Error in _createAndManageWebSocket for ${streamName}:`, error);
      return false;
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
      return new Promise((resolve, reject) => {
        this.connectionQueue.push({
          type: 'single',
          streamName,
          onMessageCallback,
          resolver: resolve,
          rejecter: reject,
        });
        if (!this.isProcessingQueue) {
          this.processConnectionQueue();
        }
      });
    } catch (error) {
      logger.error(`Error queuing connection for stream ${streamName}:`, error);
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
      const MAX_STREAMS_PER_CONNECTION = config.websocket.maxStreamsPerConnection || 25;

      if (streamNames.length > MAX_STREAMS_PER_CONNECTION) {
        logger.info(`Splitting ${streamNames.length} streams into multiple combined connections (max ${MAX_STREAMS_PER_CONNECTION} per connection)`);
        const groups = [];
        for (let i = 0; i < streamNames.length; i += MAX_STREAMS_PER_CONNECTION) {
          groups.push(streamNames.slice(i, i + MAX_STREAMS_PER_CONNECTION));
        }

        const results = await Promise.all(
          groups.map((group, index) => {
            const groupStreamName = `group${index}_${group.join('/')}`;
            return new Promise((resolve, reject) => {
              this.connectionQueue.push({
                type: 'combined',
                streamName: groupStreamName,
                originalStreamNames: group,
                onMessageCallback,
                resolver: resolve,
                rejecter: reject,
              });
              if (!this.isProcessingQueue) {
                this.processConnectionQueue();
              }
            });
          })
        );
        return !results.includes(false);
      } else {
        const combinedStreamName = streamNames.join('/');
        return new Promise((resolve, reject) => {
          this.connectionQueue.push({
            type: 'combined',
            streamName: combinedStreamName,
            originalStreamNames: streamNames,
            onMessageCallback,
            resolver: resolve,
            rejecter: reject,
          });
          if (!this.isProcessingQueue) {
            this.processConnectionQueue();
          }
        });
      }
    } catch (error) {
      logger.error(`Error queuing connection for combined streams:`, error);
      return false;
    }
  }

  /**
   * เชื่อมต่อกับ WebSocket API ของ Binance
   * @returns {Promise<WebSocket>} - WebSocket connection
   */
  async connectToWebSocketAPI() {
    try {
      const wsApiName = 'binance-ws-api';
      const existingConnection = this.connections.get(wsApiName);
      if (existingConnection && existingConnection.isAlive && existingConnection.ws && existingConnection.ws.readyState === WebSocket.OPEN) {
        return existingConnection.ws;
      }
      return new Promise((resolve, reject) => {
        this.connectionQueue.push({
          type: 'api',
          streamName: wsApiName,
          resolver: resolve,
          rejecter: reject,
        });
        if (!this.isProcessingQueue) {
          this.processConnectionQueue();
        }
      });
    } catch (error) {
      logger.error('Error queuing connection for WebSocket API:', error);
      throw error;
    }
  }

  /**
   * ประมวลผลคิวการเชื่อมต่อเพื่อรองรับการเชื่อมต่อพร้อมกันหลายเชื่อมต่อ
   */
  async processConnectionQueue() {
    if (this.isProcessingQueue || this.connectionQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;
    let processedCount = 0;

    try {
      const batchSize = Math.min(this.connectionQueue.length, this.maxConcurrentConnections);
      const currentBatch = this.connectionQueue.splice(0, batchSize);
      
      if (currentBatch.length > 0) {
        logger.info(`Processing ${currentBatch.length} WebSocket connection tasks from queue (max concurrent: ${this.maxConcurrentConnections})`);
        
        await Promise.allSettled(currentBatch.map(async (task) => {
          try {
            const { type, streamName, onMessageCallback, resolver, rejecter, originalStreamNames } = task;

            if (this.connections.has(streamName) && this.connections.get(streamName).isAlive) {
              logger.debug(`Task for already connected and alive stream: ${streamName}. Resolving.`);
              if (type === 'api') {
                resolver(this.connections.get(streamName).ws);
              } else {
                resolver(true);
              }
              if (onMessageCallback && type !== 'api') {
                if (!this.streamCallbacks.has(streamName)) {
                  this.streamCallbacks.set(streamName, []);
                }
                if (!this.streamCallbacks.get(streamName).includes(onMessageCallback)) {
                  this.streamCallbacks.get(streamName).push(onMessageCallback);
                }
              }
              processedCount++;
              return;
            }
            
            let url;
            let actualStreamName = streamName;

            if (type === 'single') {
              url = `${this.baseWsUrl}/${streamName}`;
            } else if (type === 'combined') {
              url = `${this.combinedBaseUrl}${originalStreamNames.join('/')}`;
            } else if (type === 'api') {
              url = this.apiWsUrl;
            } else {
              logger.error(`Unknown task type in connection queue: ${type}`);
              rejecter(new Error(`Unknown task type: ${type}`));
              processedCount++;
              return;
            }

            const result = await this._createAndManageWebSocket(url, actualStreamName, onMessageCallback);
            if (type === 'api' && result) {
              resolver(this.connections.get(actualStreamName).ws);
            } else if (result) {
              resolver(true);
            } else {
              rejecter(new Error(`Failed to establish connection for ${actualStreamName} via _createAndManageWebSocket`));
            }
          } catch (error) {
            logger.error(`Error processing connection task for ${task.streamName}: ${error.message}`, error.stack);
            if (task.rejecter) {
              task.rejecter(error);
            }
          } finally {
            processedCount++;
          }
        }));
      }
    } catch (error) {
      logger.error(`Critical error in processConnectionQueue: ${error.message}`, error.stack);
    } finally {
      this.isProcessingQueue = false;
      if (this.connectionQueue.length > 0) {
        setImmediate(() => this.processConnectionQueue());
      } else {
        logger.info(`Connection queue processed. Processed ${processedCount} tasks in this batch.`);
      }
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
      
      if (unhealthyConnections.length > 0) {
        logger.warn(`Found ${unhealthyConnections.length} unhealthy connections, attempting to reconnect`);
        
        for (const streamName of unhealthyConnections) {
          if (streamName.includes('/') || streamName.startsWith('group')) {
            const parts = streamName.startsWith('group') ? streamName.substring(streamName.indexOf('_') + 1).split('/') : streamName.split('/');
            logger.info(`Reconnecting unhealthy combined/group stream: ${streamName} with parts: ${parts.join(', ')}`);
            this.disconnect(streamName);
            this.connectToCombinedStreams(parts, this.streamCallbacks.get(streamName)?.[0]).catch(err => {
              logger.error(`Failed to re-queue combined stream ${streamName} after monitor detection:`, err);
            });
          } else if (streamName === 'binance-ws-api') {
            logger.info(`Reconnecting unhealthy API stream: ${streamName}`);
            this.disconnect(streamName);
            this.connectToWebSocketAPI().catch(err => {
              logger.error(`Failed to re-queue API stream ${streamName} after monitor detection:`, err);
            });
          } else {
            logger.info(`Reconnecting unhealthy single stream: ${streamName}`);
            this.disconnect(streamName);
            this.connectToStream(streamName, this.streamCallbacks.get(streamName)?.[0]).catch(err => {
              logger.error(`Failed to re-queue single stream ${streamName} after monitor detection:`, err);
            });
          }
        }
      }
      
      await this.optimizeConnectionPool();
      
      return unhealthyConnections.length;
    } catch (error) {
      logger.error('Error monitoring connections:', error);
      return -1;
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
  }

  /**
   * ยกเลิกการเชื่อมต่อทั้งหมด
   */
  disconnectAll() {
    logger.info('Disconnecting all WebSocket connections');
    
    this.stopConnectionMonitoring();
    
    if (this.connectionQueue.length > 0) {
      logger.info(`Clearing connection queue with ${this.connectionQueue.length} pending connections`);
      
      this.connectionQueue.forEach(task => {
        try {
          task.rejecter(new Error('Connection request canceled - disconnecting all connections'));
        } catch (error) {}
      });
      
      this.connectionQueue = [];
    }
    
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
   * ปรับขนาดสระการเชื่อมต่อตามการใช้งาน
   * ช่วยเพิ่มหรือลดขนาด connection pool ตามความต้องการปัจจุบัน
   */
  async optimizeConnectionPool() {
    try {
      const currentConnections = this.connections.size;
      const maxConnections = config.websocket.maxConnections;
      const queueSize = this.connectionQueue.length;
      
      if (currentConnections < maxConnections * 0.5 && queueSize > 10) {
        const newMaxConcurrent = Math.min(maxConnections, this.maxConcurrentConnections * 1.5);
        
        if (newMaxConcurrent > this.maxConcurrentConnections) {
          logger.info(`Scaling up connection pool: ${this.maxConcurrentConnections} -> ${newMaxConcurrent}`);
          this.maxConcurrentConnections = Math.floor(newMaxConcurrent);
        }
      } else if (currentConnections < maxConnections * 0.2 && queueSize === 0 && this.maxConcurrentConnections > 20) {
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
}

// สร้าง instance เดียวของ Manager
const binanceWebSocketManager = new BinanceWebSocketManager();

module.exports = binanceWebSocketManager;

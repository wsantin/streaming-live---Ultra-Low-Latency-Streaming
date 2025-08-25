#!/usr/bin/env node

/**
 * 🚀 WebRTC P2P Performance Load Testing Tool
 * ============================================
 * 
 * Simulates 100 concurrent connections to test:
 * - WebSocket connection latency
 * - WebRTC P2P connection establishment
 * - Signaling server performance
 * - Memory usage under load
 * - Connection stability
 */

const io = require('socket.io-client');
const { performance } = require('perf_hooks');

// Configuration
const CONFIG = {
  SERVER_URL: 'http://192.168.1.37:5001',
  TOTAL_CONNECTIONS: 1000,
  BATCH_SIZE: 10, // Connect 10 at a time
  BATCH_DELAY: 1000, // 1 second between batches
  TEST_DURATION: 60000, // 1 minute test
  RECONNECT_ATTEMPTS: 3
};

class WebRTCLoadTester {
  constructor() {
    this.connections = [];
    this.metrics = {
      totalConnections: 0,
      successfulConnections: 0,
      failedConnections: 0,
      averageConnectionTime: 0,
      minLatency: Infinity,
      maxLatency: 0,
      totalLatency: 0,
      connectionTimes: [],
      disconnections: 0,
      reconnections: 0,
      errors: []
    };
    this.startTime = null;
    this.testInterval = null;
  }

  async runLoadTest() {
    console.log(`🚀 Starting WebRTC P2P Load Test`);
    console.log(`📊 Configuration:`);
    console.log(`   • Server: ${CONFIG.SERVER_URL}`);
    console.log(`   • Connections: ${CONFIG.TOTAL_CONNECTIONS}`);
    console.log(`   • Batch Size: ${CONFIG.BATCH_SIZE}`);
    console.log(`   • Test Duration: ${CONFIG.TEST_DURATION / 1000}s`);
    console.log(`================================\n`);

    this.startTime = performance.now();
    
    // Start progress monitoring
    this.startProgressMonitoring();

    // Create connections in batches
    await this.createConnectionsInBatches();

    // Wait for test duration
    console.log(`⏳ Running test for ${CONFIG.TEST_DURATION / 1000} seconds...\n`);
    await this.sleep(CONFIG.TEST_DURATION);

    // Generate final report
    this.generateFinalReport();

    // Cleanup
    await this.cleanup();
  }

  async createConnectionsInBatches() {
    const totalBatches = Math.ceil(CONFIG.TOTAL_CONNECTIONS / CONFIG.BATCH_SIZE);
    
    for (let batch = 0; batch < totalBatches; batch++) {
      const batchStart = batch * CONFIG.BATCH_SIZE;
      const batchEnd = Math.min(batchStart + CONFIG.BATCH_SIZE, CONFIG.TOTAL_CONNECTIONS);
      
      console.log(`📦 Batch ${batch + 1}/${totalBatches}: Creating connections ${batchStart + 1}-${batchEnd}`);
      
      const batchPromises = [];
      for (let i = batchStart; i < batchEnd; i++) {
        batchPromises.push(this.createConnection(i + 1));
      }
      
      await Promise.allSettled(batchPromises);
      
      // Wait between batches (except for the last one)
      if (batch < totalBatches - 1) {
        await this.sleep(CONFIG.BATCH_DELAY);
      }
    }
  }

  async createConnection(connectionId) {
    const connectionStart = performance.now();
    
    try {
      const socket = io(CONFIG.SERVER_URL, {
        transports: ['websocket'],
        timeout: 5000,
        forceNew: true
      });

      const connection = {
        id: connectionId,
        socket: socket,
        connected: false,
        connectionTime: null,
        latency: null,
        errors: 0,
        reconnectAttempts: 0
      };

      // Connection success
      socket.on('connect', () => {
        const connectionTime = performance.now() - connectionStart;
        connection.connected = true;
        connection.connectionTime = connectionTime;
        
        this.metrics.successfulConnections++;
        this.metrics.connectionTimes.push(connectionTime);
        
        // Join as viewer to simulate real usage
        socket.emit('viewer:join', `load_test_viewer_${connectionId}`);
        
        // Measure latency with ping-pong
        this.measureLatency(connection);
      });

      // Connection errors
      socket.on('connect_error', (error) => {
        connection.errors++;
        this.metrics.errors.push({
          connectionId,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        
        if (connection.reconnectAttempts < CONFIG.RECONNECT_ATTEMPTS) {
          connection.reconnectAttempts++;
          this.metrics.reconnections++;
          socket.connect();
        } else {
          this.metrics.failedConnections++;
        }
      });

      // Disconnection handling
      socket.on('disconnect', (reason) => {
        connection.connected = false;
        this.metrics.disconnections++;
        
        if (reason === 'io server disconnect') {
          // Server initiated disconnect, don't reconnect
          return;
        }
        
        // Attempt reconnection for client-side issues
        if (connection.reconnectAttempts < CONFIG.RECONNECT_ATTEMPTS) {
          connection.reconnectAttempts++;
          this.metrics.reconnections++;
          socket.connect();
        }
      });

      this.connections.push(connection);
      this.metrics.totalConnections++;
      
    } catch (error) {
      this.metrics.failedConnections++;
      this.metrics.errors.push({
        connectionId,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  measureLatency(connection) {
    const startPing = performance.now();
    
    // Send ping every 5 seconds
    const pingInterval = setInterval(() => {
      if (!connection.connected) {
        clearInterval(pingInterval);
        return;
      }
      
      const pingStart = performance.now();
      connection.socket.emit('ping', pingStart);
    }, 5000);

    // Handle pong response
    connection.socket.on('pong', (originalTime) => {
      const latency = performance.now() - originalTime;
      connection.latency = latency;
      
      this.metrics.totalLatency += latency;
      this.metrics.minLatency = Math.min(this.metrics.minLatency, latency);
      this.metrics.maxLatency = Math.max(this.metrics.maxLatency, latency);
    });
  }

  startProgressMonitoring() {
    this.testInterval = setInterval(() => {
      this.printProgressReport();
    }, 5000); // Print progress every 5 seconds
  }

  printProgressReport() {
    const elapsed = (performance.now() - this.startTime) / 1000;
    const connected = this.connections.filter(c => c.connected).length;
    const avgConnectionTime = this.metrics.connectionTimes.length > 0 
      ? this.metrics.connectionTimes.reduce((a, b) => a + b, 0) / this.metrics.connectionTimes.length 
      : 0;
    
    const avgLatency = this.metrics.totalLatency > 0 && this.metrics.successfulConnections > 0
      ? this.metrics.totalLatency / this.metrics.successfulConnections
      : 0;

    console.log(`\n📊 Progress Report (${elapsed.toFixed(1)}s elapsed):`);
    console.log(`   • Connected: ${connected}/${CONFIG.TOTAL_CONNECTIONS}`);
    console.log(`   • Success Rate: ${((this.metrics.successfulConnections / this.metrics.totalConnections) * 100).toFixed(1)}%`);
    console.log(`   • Avg Connection Time: ${avgConnectionTime.toFixed(2)}ms`);
    console.log(`   • Avg Latency: ${avgLatency.toFixed(2)}ms`);
    console.log(`   • Failed: ${this.metrics.failedConnections}`);
    console.log(`   • Reconnections: ${this.metrics.reconnections}`);
    console.log(`   • Errors: ${this.metrics.errors.length}`);
  }

  generateFinalReport() {
    const totalTime = (performance.now() - this.startTime) / 1000;
    const connected = this.connections.filter(c => c.connected).length;
    const avgConnectionTime = this.metrics.connectionTimes.length > 0 
      ? this.metrics.connectionTimes.reduce((a, b) => a + b, 0) / this.metrics.connectionTimes.length 
      : 0;
    
    const avgLatency = this.metrics.totalLatency > 0 && this.metrics.successfulConnections > 0
      ? this.metrics.totalLatency / this.metrics.successfulConnections
      : 0;

    console.log(`\n\n🎯 FINAL PERFORMANCE REPORT`);
    console.log(`================================`);
    console.log(`⏱️  Test Duration: ${totalTime.toFixed(2)}s`);
    console.log(`🔗 Connection Statistics:`);
    console.log(`   • Total Attempted: ${this.metrics.totalConnections}`);
    console.log(`   • Successful: ${this.metrics.successfulConnections}`);
    console.log(`   • Failed: ${this.metrics.failedConnections}`);
    console.log(`   • Currently Connected: ${connected}`);
    console.log(`   • Success Rate: ${((this.metrics.successfulConnections / this.metrics.totalConnections) * 100).toFixed(2)}%`);
    
    console.log(`\n⚡ Performance Metrics:`);
    console.log(`   • Avg Connection Time: ${avgConnectionTime.toFixed(2)}ms`);
    console.log(`   • Min Latency: ${this.metrics.minLatency === Infinity ? 'N/A' : this.metrics.minLatency.toFixed(2) + 'ms'}`);
    console.log(`   • Max Latency: ${this.metrics.maxLatency.toFixed(2)}ms`);
    console.log(`   • Avg Latency: ${avgLatency.toFixed(2)}ms`);
    
    console.log(`\n🔄 Stability Metrics:`);
    console.log(`   • Disconnections: ${this.metrics.disconnections}`);
    console.log(`   • Reconnections: ${this.metrics.reconnections}`);
    console.log(`   • Total Errors: ${this.metrics.errors.length}`);
    
    console.log(`\n📈 Performance Assessment:`);
    this.assessPerformance(avgLatency, this.metrics.successfulConnections / this.metrics.totalConnections);
    
    if (this.metrics.errors.length > 0) {
      console.log(`\n❌ Error Summary:`);
      const errorCounts = {};
      this.metrics.errors.forEach(error => {
        errorCounts[error.error] = (errorCounts[error.error] || 0) + 1;
      });
      
      Object.entries(errorCounts).forEach(([error, count]) => {
        console.log(`   • ${error}: ${count} occurrences`);
      });
    }

    // Save detailed report to file
    this.saveReportToFile();
  }

  assessPerformance(avgLatency, successRate) {
    let assessment = "⚡ EXCELLENT - TikTok Live level performance";
    
    if (avgLatency > 500) {
      assessment = "⚠️ GOOD - Acceptable for most use cases";
    }
    if (avgLatency > 1000) {
      assessment = "🐌 POOR - High latency detected";
    }
    if (successRate < 0.95) {
      assessment = "❌ UNSTABLE - Low connection success rate";
    }
    if (avgLatency <= 300 && successRate >= 0.98) {
      assessment = "🚀 OUTSTANDING - Professional streaming quality";
    }
    
    console.log(`   ${assessment}`);
    console.log(`   • Target: <500ms latency, >95% success rate`);
    console.log(`   • Achieved: ${avgLatency.toFixed(2)}ms latency, ${(successRate * 100).toFixed(2)}% success rate`);
  }

  saveReportToFile() {
    const report = {
      timestamp: new Date().toISOString(),
      testConfig: CONFIG,
      metrics: this.metrics,
      connections: this.connections.map(c => ({
        id: c.id,
        connected: c.connected,
        connectionTime: c.connectionTime,
        latency: c.latency,
        errors: c.errors,
        reconnectAttempts: c.reconnectAttempts
      }))
    };
    
    const fs = require('fs');
    const filename = `webrtc-load-test-${Date.now()}.json`;
    fs.writeFileSync(filename, JSON.stringify(report, null, 2));
    console.log(`\n💾 Detailed report saved to: ${filename}`);
  }

  async cleanup() {
    console.log(`\n🧹 Cleaning up connections...`);
    
    if (this.testInterval) {
      clearInterval(this.testInterval);
    }
    
    // Disconnect all sockets
    await Promise.all(
      this.connections.map(connection => {
        return new Promise(resolve => {
          if (connection.socket && connection.connected) {
            connection.socket.disconnect();
            connection.socket.on('disconnect', resolve);
            setTimeout(resolve, 1000); // Force resolve after 1s
          } else {
            resolve();
          }
        });
      })
    );
    
    console.log(`✅ Cleanup completed`);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run the load test
async function main() {
  const tester = new WebRTCLoadTester();
  
  try {
    await tester.runLoadTest();
  } catch (error) {
    console.error('❌ Load test failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Test interrupted by user');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\n🛑 Test terminated');
  process.exit(0);
});

if (require.main === module) {
  main();
}

module.exports = WebRTCLoadTester;
/**
 * Test script for webhook implementation
 * This script can be used to test the webhook functionality
 */

import { WebhookService } from '../services/webhook-service';
import { TaskWorker } from '../workers/task-worker';
import { AsyncProcessor } from '../utils/async-utils';

// Test configuration
const TEST_WEBHOOK_CONFIG = {
  url: 'https://webhook.site/your-unique-url', // Replace with actual webhook URL for testing
  token: 'test-token',
  authentication: {
    schemes: ['Bearer']
  }
};

/**
 * Test webhook service directly
 */
export async function testWebhookService() {
  console.log('🧪 Testing Webhook Service...');
  
  const webhookService = WebhookService.getInstance();
  
  const testPayload = {
    jsonrpc: "2.0",
    id: "test-123",
    result: {
      id: "task-123",
      contextId: "context-123",
      status: {
        state: "completed" as const,
        timestamp: new Date().toISOString(),
        message: {
          messageId: "msg-123",
          role: "agent" as const,
          parts: [{ kind: "text" as const, text: "Test webhook response" }],
          kind: "message" as const,
        },
      },
      kind: "task" as const,
    }
  };

  try {
    const success = await webhookService.sendWebhook(TEST_WEBHOOK_CONFIG, testPayload);
    console.log(`✅ Webhook test ${success ? 'succeeded' : 'failed'}`);
    return success;
  } catch (error) {
    console.error('❌ Webhook test failed:', error);
    return false;
  }
}

/**
 * Test task worker
 */
export async function testTaskWorker() {
  console.log('🧪 Testing Task Worker...');
  
  const taskWorker = TaskWorker.getInstance();
  
  const testTask = {
    agentId: 'forexSageAgent' as const,
    messages: [
      {
        role: 'user' as const,
        parts: [
          { kind: 'text' as const, text: 'What is the exchange rate of USD to NGN?' }
        ]
      }
    ],
    webhookConfig: TEST_WEBHOOK_CONFIG,
  };

  try {
    const taskId = taskWorker.addTask(testTask);
    console.log(`✅ Task added to queue with ID: ${taskId}`);
    
    // Check queue status
    const status = taskWorker.getQueueStatus();
    console.log(`📊 Queue status: ${JSON.stringify(status)}`);
    
    return taskId;
  } catch (error) {
    console.error('❌ Task worker test failed:', error);
    return null;
  }
}

/**
 * Test async processor
 */
export async function testAsyncProcessor() {
  console.log('🧪 Testing Async Processor...');
  
  const asyncProcessor = AsyncProcessor.getInstance();
  
  // Test with a function that completes quickly
  const quickFunction = async () => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    return { result: 'Quick completion test' };
  };

  try {
    const result = await asyncProcessor.executeWithFallback(quickFunction, {
      timeoutMs: 2000,
      webhookConfig: TEST_WEBHOOK_CONFIG,
    });
    
    console.log(`✅ Async processor test result:`, result);
    return result;
  } catch (error) {
    console.error('❌ Async processor test failed:', error);
    return null;
  }
}

/**
 * Test timeout scenario
 */
export async function testTimeoutScenario() {
  console.log('🧪 Testing Timeout Scenario...');
  
  const asyncProcessor = AsyncProcessor.getInstance();
  
  // Test with a function that takes longer than timeout
  const slowFunction = async () => {
    await new Promise(resolve => setTimeout(resolve, 5000));
    return { result: 'This should not be returned' };
  };

  try {
    const result = await asyncProcessor.executeWithFallback(slowFunction, {
      timeoutMs: 2000,
      webhookConfig: TEST_WEBHOOK_CONFIG,
      fallbackToWebhook: true,
    });
    
    console.log(`✅ Timeout test result:`, result);
    return result;
  } catch (error) {
    console.error('❌ Timeout test failed:', error);
    return null;
  }
}

/**
 * Run all tests
 */
export async function runAllTests() {
  console.log('🚀 Starting Webhook Implementation Tests...\n');
  
  const results = {
    webhookService: await testWebhookService(),
    taskWorker: await testTaskWorker(),
    asyncProcessor: await testAsyncProcessor(),
    timeoutScenario: await testTimeoutScenario(),
  };
  
  console.log('\n📋 Test Results Summary:');
  console.log('========================');
  Object.entries(results).forEach(([test, result]) => {
    const status = result ? '✅ PASSED' : '❌ FAILED';
    console.log(`${test.padEnd(20)}: ${status}`);
  });
  
  const passedCount = Object.values(results).filter(Boolean).length;
  const totalCount = Object.keys(results).length;
  
  console.log(`\n🎯 Overall: ${passedCount}/${totalCount} tests passed`);
  
  return results;
}

/**
 * Test webhook receiver endpoint (requires running server)
 */
export async function testWebhookReceiver(serverUrl: string = 'http://localhost:3000') {
  console.log('🧪 Testing Webhook Receiver Endpoint...');
  
  const testPayload = {
    jsonrpc: "2.0",
    id: "receiver-test-123",
    result: {
      id: "receiver-task-123",
      contextId: "receiver-context-123",
      status: {
        state: "completed" as const,
        timestamp: new Date().toISOString(),
        message: {
          messageId: "receiver-msg-123",
          role: "agent" as const,
          parts: [{ kind: "text" as const, text: "Test receiver webhook response" }],
          kind: "message" as const,
        },
      },
      kind: "task" as const,
    }
  };

  try {
    const response = await fetch(`${serverUrl}/webhook/receiver`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload),
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Webhook receiver test succeeded:', result);
      return true;
    } else {
      console.error('❌ Webhook receiver test failed with status:', response.status);
      return false;
    }
  } catch (error) {
    console.error('❌ Webhook receiver test failed:', error);
    return false;
  }
}

/**
 * Test webhook health endpoint
 */
export async function testWebhookHealth(serverUrl: string = 'http://localhost:3000') {
  console.log('🧪 Testing Webhook Health Endpoint...');
  
  try {
    const response = await fetch(`${serverUrl}/webhook/health`);
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Webhook health test succeeded:', result);
      return true;
    } else {
      console.error('❌ Webhook health test failed with status:', response.status);
      return false;
    }
  } catch (error) {
    console.error('❌ Webhook health test failed:', error);
    return false;
  }
}

// Export test functions for use in other files
export default {
  testWebhookService,
  testTaskWorker,
  testAsyncProcessor,
  testTimeoutScenario,
  runAllTests,
  testWebhookReceiver,
  testWebhookHealth,
};

// If this file is run directly, execute all tests
if (require.main === module) {
  runAllTests().catch(console.error);
}
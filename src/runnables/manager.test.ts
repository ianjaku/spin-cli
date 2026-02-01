import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RunnableManager } from './manager.js';
import type { SpinConfig } from '../types.js';

describe('RunnableManager', () => {
  describe('PTY mode', () => {
    let manager: RunnableManager;
    
    afterEach(async () => {
      if (manager) {
        await manager.stopAll();
      }
    });

    it('should receive output from processes with pty: true', async () => {
      const config: SpinConfig = {
        runnables: {
          echoTest: {
            type: 'shell',
            // Use a command that stays running long enough for screen updates
            command: 'echo "Hello from PTY test" && sleep 0.5',
            pty: true,
          },
        },
      };

      manager = new RunnableManager(config);
      manager.init(['echoTest']);

      await manager.start('echoTest');
      
      // Wait for screen updates to capture output
      await new Promise(resolve => setTimeout(resolve, 800));

      // Check the output buffer directly (PTY uses screen-refresh which replaces buffer)
      const outputBuffer = manager.getOutputLines('echoTest', 'all');
      expect(outputBuffer.length).toBeGreaterThan(0);
      const combinedOutput = outputBuffer.join('\n');
      expect(combinedOutput).toContain('Hello from PTY test');
    });

    it('should receive output from processes without pty (normal mode)', async () => {
      const config: SpinConfig = {
        runnables: {
          echoTest: {
            type: 'shell',
            command: 'echo "Hello from normal mode"',
            pty: false,
          },
        },
      };

      manager = new RunnableManager(config);
      manager.init(['echoTest']);

      const outputLines: string[] = [];
      manager.on('output', (id, line) => {
        if (id === 'echoTest') {
          outputLines.push(line);
        }
      });

      await manager.start('echoTest');
      
      // Wait for process to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(outputLines.length).toBeGreaterThan(0);
      const combinedOutput = outputLines.join('\n');
      expect(combinedOutput).toContain('Hello from normal mode');
    });
  });
});

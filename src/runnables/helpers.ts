import type { RunnableDefinition, ShellOptions, DockerOptions } from '../types.js';

/**
 * Create a shell command runnable.
 * 
 * @example
 * ```ts
 * shell('npm run dev', { cwd: './api' })
 * shell('yarn start', { env: { PORT: '3000' } })
 * ```
 */
export function shell(command: string, options: ShellOptions = {}): RunnableDefinition {
  return {
    type: 'shell',
    command,
    ...options,
  };
}

/**
 * Create a docker container runnable.
 * 
 * @example
 * ```ts
 * docker('postgres:15', { 
 *   ports: ['5432:5432'],
 *   env: { POSTGRES_PASSWORD: 'dev' }
 * })
 * ```
 */
export function docker(image: string, options: DockerOptions = {}): RunnableDefinition {
  const { ports = [], volumes = [], ...rest } = options;
  
  // Build docker run command
  const args: string[] = ['docker', 'run', '--rm'];
  
  for (const port of ports) {
    args.push('-p', port);
  }
  
  for (const volume of volumes) {
    args.push('-v', volume);
  }
  
  if (rest.env) {
    for (const [key, value] of Object.entries(rest.env)) {
      args.push('-e', `${key}=${value}`);
    }
  }
  
  args.push(image);
  
  return {
    type: 'docker',
    command: args.join(' '),
    ...rest,
  };
}

import { useState, useRef, useEffect } from 'preact/hooks';

interface TerminalLine {
  type: 'input' | 'output' | 'error';
  content: string;
}

const COMMAND_RESPONSES: Record<string, string | string[]> = {
  'docker --help': `Usage:  docker [OPTIONS] COMMAND

A self-sufficient runtime for containers

Common Commands:
  run         Create and run a new container from an image
  build       Build an image from a Dockerfile
  pull        Download an image from a registry
  push        Upload an image to a registry
  images      List images
  ps          List containers
  exec        Execute a command in a running container
  start       Start one or more stopped containers
  stop        Stop one or more running containers
  restart     Restart one or more containers
  rm          Remove one or more containers
  rmi         Remove one or more images
  logs        Fetch the logs of a container
  inspect     Return low-level information on Docker objects
  version     Show the Docker version information`,

  'docker version': `Client:
 Version:           24.0.7
 API version:       1.43
 Go version:        go1.20.10
 Git commit:        afdd53b
 Built:             Thu Oct 26 09:08:44 2023
 OS/Arch:           linux/amd64
 Context:           default

Server:
 Engine:
  Version:          24.0.7
  API version:      1.43 (minimum version 1.12)
  Go version:       go1.20.10
  Git commit:       311b9ff
  Built:            Thu Oct 26 09:08:44 2023
  OS/Arch:          linux/amd64`,

  'docker images': `REPOSITORY          TAG       IMAGE ID       CREATED        SIZE
my-app              latest    abc123def456   2 minutes ago  125MB
node                18-alpine bcd234efa567   3 days ago     110MB
nginx               latest    cde345fgh678   1 week ago     142MB`,

  'docker ps': `CONTAINER ID   IMAGE      COMMAND                  CREATED         STATUS         PORTS     NAMES
9f8a7b6c5d4e   my-app     "docker-entrypoint.s…"   10 minutes ago  Up 10 minutes  3000/tcp  yummy-munchkin`,

  'docker ps -a': `CONTAINER ID   IMAGE      COMMAND                  CREATED         STATUS                     PORTS     NAMES
9f8a7b6c5d4e   my-app     "docker-entrypoint.s…"   10 minutes ago  Up 10 minutes              3000/tcp  yummy-munchkin
8e7d6c5b4a3f   my-app     "docker-entrypoint.s…"   1 hour ago      Exited (0) 30 minutes ago            delectable-dodo
7d6c5b4a3e2f   nginx      "nginx -g daemon off…"   2 hours ago     Exited (0) 1 hour ago                unfortunate-pebble`,

  'docker run my-app': `9f8a7b6c5d4e
Container started successfully`,

  'docker run -d my-app': `9f8a7b6c5d4e`,

  'docker run -p 3000:3000 my-app': `9f8a7b6c5d4e
Listening on port 3000...`,

  'docker build -t my-app .': `[+] Building 12.3s (10/10) FINISHED
 => [internal] load build definition from Dockerfile
 => => transferring dockerfile: 156B
 => [internal] load .dockerignore
 => => transferring context: 2B
 => [internal] load metadata for docker.io/library/node:18-alpine
 => [1/5] FROM docker.io/library/node:18-alpine
 => [internal] load build context
 => => transferring context: 1.2MB
 => [2/5] WORKDIR /app
 => [3/5] COPY package.json .
 => [4/5] RUN npm install
 => [5/5] COPY . .
 => exporting to image
 => => exporting layers
 => => writing image sha256:abc123def456
 => => naming to docker.io/library/my-app`,

  'docker stop yummy-munchkin': `yummy-munchkin`,

  'docker start yummy-munchkin': `yummy-munchkin`,

  'docker restart yummy-munchkin': `yummy-munchkin`,

  'docker rm yummy-munchkin': `yummy-munchkin`,

  'docker rmi my-app': `Untagged: my-app:latest
Deleted: sha256:abc123def456`,

  'docker logs yummy-munchkin': `Server starting...
Connected to database
Listening on port 3000
GET / 200 12ms
GET /api/users 200 45ms
POST /api/users 201 89ms`,

  'docker exec -it yummy-munchkin sh': `#
# (interactive shell - type 'exit' to leave)`,

  'docker inspect yummy-munchkin': `[
    {
        "Id": "9f8a7b6c5d4e...",
        "Created": "2025-10-19T10:30:00.000000000Z",
        "Path": "docker-entrypoint.sh",
        "Args": ["node", "index.js"],
        "State": {
            "Status": "running",
            "Running": true,
            "Paused": false,
            "Restarting": false,
            "OOMKilled": false,
            "Dead": false,
            "Pid": 12345,
            "ExitCode": 0
        },
        "Image": "sha256:abc123def456...",
        "Name": "/yummy-munchkin",
        "HostConfig": {
            "NetworkMode": "default"
        },
        "NetworkSettings": {
            "IPAddress": "172.17.0.2"
        }
    }
]`,

  'docker pull node:18-alpine': `18-alpine: Pulling from library/node
001c52e26ad5: Pull complete
d9d4b9b6e964: Pull complete
2068746827ec: Pull complete
9daef329d350: Pull complete
Digest: sha256:bcd234efa567...
Status: Downloaded newer image for node:18-alpine
docker.io/library/node:18-alpine`,

  'docker push my-app': `The push refers to repository [docker.io/library/my-app]
abc123: Pushed
def456: Pushed
latest: digest: sha256:abc123def456 size: 1234`
};

export default function DockerTerminal() {
  const [lines, setLines] = useState<TerminalLine[]>([
    { type: 'output', content: 'Welcome to Docker Terminal Demo!' },
    { type: 'output', content: 'Try commands like: docker --help, docker images, docker ps, docker build -t my-app .' },
    { type: 'output', content: '' }
  ]);
  const [input, setInput] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [lines]);

  const handleSubmit = (e: Event) => {
    e.preventDefault();

    if (!input.trim()) return;

    // Add input to terminal
    setLines(prev => [...prev, { type: 'input', content: `$ ${input}` }]);

    // Add to command history
    setCommandHistory(prev => [...prev, input]);
    setHistoryIndex(-1);

    // Find matching command
    const normalizedInput = input.trim().toLowerCase();
    let response: string | string[] | undefined;

    // Exact match first
    if (COMMAND_RESPONSES[normalizedInput]) {
      response = COMMAND_RESPONSES[normalizedInput];
    } else {
      // Partial match for common patterns
      const commandStart = normalizedInput.split(' ')[0];
      if (commandStart === 'docker') {
        // Handle unrecognized docker commands
        if (normalizedInput === 'docker') {
          response = "docker: 'docker' is not a docker command.\nSee 'docker --help'";
        } else {
          response = `docker: '${normalizedInput.split(' ')[1]}' is not a docker command.\nSee 'docker --help'`;
        }
      } else {
        response = `Command not found: ${input}\nTry 'docker --help' for available commands.`;
      }
    }

    // Add response to terminal
    const responseLines = Array.isArray(response) ? response : [response];
    const outputLines = responseLines.flatMap(r =>
      r.split('\n').map(line => ({
        type: line.includes('not found') || line.includes('is not a docker command') ? ('error' as const) : ('output' as const),
        content: line
      }))
    );

    setLines(prev => [...prev, ...outputLines, { type: 'output', content: '' }]);
    setInput('');
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setInput(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex !== -1) {
        const newIndex = historyIndex + 1;
        if (newIndex >= commandHistory.length) {
          setHistoryIndex(-1);
          setInput('');
        } else {
          setHistoryIndex(newIndex);
          setInput(commandHistory[newIndex]);
        }
      }
    }
  };

  const handleClear = () => {
    setLines([
      { type: 'output', content: 'Terminal cleared' },
      { type: 'output', content: '' }
    ]);
  };

  return (
    <div className="aside-tall">
      <div className="sticky top-20 flex flex-col overflow-hidden rounded-lg border border-content/20 bg-bkg shadow-lg">
        {/* Terminal Header */}
        <div className="flex items-center justify-between border-b border-content/20 bg-content/5 px-4 py-2">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="h-3 w-3 rounded-full bg-red-500"></div>
              <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
              <div className="h-3 w-3 rounded-full bg-green-500"></div>
            </div>
            <span className="ml-2 font-mono text-sm text-content/75">docker-terminal</span>
          </div>
          <button onClick={handleClear} className="rounded bg-content/10 hover:bg-content/20 px-3 py-1 text-xs text-content transition-colors">
            Clear
          </button>
        </div>

        {/* Terminal Content */}
        <div ref={terminalRef} className="max-h-[500px] flex-1 overflow-y-auto p-4 font-mono text-sm bg-content/[0.02]" onClick={() => inputRef.current?.focus()}>
          {lines.map((line, i) => (
            <div
              key={i}
              className={`${
                line.type === 'input'
                  ? 'text-green-600 dark:text-green-400'
                  : line.type === 'error'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-content/75'
              } ${line.content === '' ? 'h-4' : ''}`}
            >
              {line.content || '\u00A0'}
            </div>
          ))}

          {/* Input Line */}
          <form onSubmit={handleSubmit} className="flex items-center text-green-600 dark:text-green-400">
            <span className="mr-2">$</span>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onInput={e => setInput((e.target as HTMLInputElement).value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent text-content caret-green-600 dark:caret-green-400 outline-none"
              spellcheck={false}
            />
          </form>
        </div>

        {/* Helper Info */}
        <div className="border-t border-content/20 bg-content/5 px-4 py-2 text-xs text-content/60">
          <p>
            Try: <code className="text-blue-600 dark:text-blue-400">docker images</code>, <code className="text-blue-600 dark:text-blue-400">docker ps</code>,{' '}
            <code className="text-blue-600 dark:text-blue-400">docker build -t my-app .</code>
          </p>
          <p className="mt-1">Use ↑/↓ arrows for command history</p>
        </div>
      </div>
    </div>
  );
}

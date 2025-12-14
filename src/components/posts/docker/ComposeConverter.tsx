import { useCallback, useState, useEffect, useRef } from 'preact/hooks';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { yaml } from '@codemirror/lang-yaml';
import { StreamLanguage } from '@codemirror/language';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { vscodeDark, vscodeLight } from '@uiw/codemirror-theme-vscode';
import composerize from 'composerize';
import decomposerize from 'decomposerize';

const SIMPLE_EXAMPLE = `name: basic
services:
  web:
    image: nginx:alpine
    ports:
      - "8080:80"`;

const COMPLEX_EXAMPLE = `name: complex
services:
  database:
    image: postgres:15
    environment:
      POSTGRES_USER: appuser
      POSTGRES_PASSWORD: secretpass
      POSTGRES_DB: myappdb
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U appuser"]
      interval: 10s
      timeout: 5s
      retries: 5

  api:
    build: ./api
    image: my-backend:latest 
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://appuser:secretpass@database:5432/myappdb
    depends_on:
      database:
        condition: service_healthy

volumes:
  postgres_data:`;

type EditorType = 'compose' | 'run';

export default function ComposeConverter() {
  const [composeCode, setComposeCode] = useState(SIMPLE_EXAMPLE);
  const [dockerRunCode, setDockerRunCode] = useState('');
  const [activeEditor, setActiveEditor] = useState<EditorType | null>('compose');
  const [error, setError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(true);

  const debounceTimerRef = useRef<number | null>(null);

  // Detect theme changes
  useEffect(() => {
    const checkTheme = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };

    checkTheme();

    // Watch for theme changes
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, []);

  // Conversion: Compose -> Docker Run
  const convertComposeToRun = useCallback((composeYaml: string) => {
    if (!composeYaml.trim()) {
      setDockerRunCode('');
      setError(null);
      return;
    }

    try {
      let result = decomposerize(composeYaml);
      result = result.split('\n').join('\n\n');
      setDockerRunCode(result);
      setError(null);
    } catch (err) {
      setError(`Conversion error: ${err instanceof Error ? err.message : 'Invalid YAML or unsupported features'}`);
    }
  }, []);

  // Conversion: Docker Run -> Compose
  const convertRunToCompose = useCallback((dockerRun: string) => {
    if (!dockerRun.trim()) {
      setComposeCode('');
      setError(null);
      return;
    }

    try {
      // Handle multiple docker run commands
      const commands = dockerRun
        .split('\n\n')
        .map(cmd => cmd.trim())
        .filter(cmd => cmd.length > 0)
        .filter(cmd => !cmd.startsWith('docker volume'));

      const volumes = dockerRun
        .split('\n\n')
        .map(cmd => cmd.trim())
        .filter(cmd => cmd.startsWith('docker volume'))
        .map(cmd => {
          const match = cmd.match(/docker volume create (\S+)/);
          return match ? match[1] : null;
        })
        .filter((v): v is string => v !== null);

      if (commands.length === 0) {
        setComposeCode('');
        return;
      }
      // Convert each command and combine
      let composeYaml = composerize(commands.join('\n'), null, 'latest', 2);
      composeYaml = composeYaml.replace(/# named volume.*\n/g, '');
      // remove 'external: true' and 'name: volume_name' lines from volumes that were created via 'docker volume create'
      volumes.forEach(volumeName => {
        const volumeRegex = new RegExp(`(${volumeName}:\n(?: {4}.*\n?)*)`, 'g');
        composeYaml = composeYaml.replace(volumeRegex, match => {
          return match
            .split('\n')
            .filter(line => !line.includes('external: true') && !line.includes(`name: ${volumeName}`))
            .join('\n');
        });
      });
      composeYaml = composeYaml.replace(/( {4,}.*)\n( {0,2})(?=\S)/g, '$1\n\n$2'); // Add newline between top-level keys
      setComposeCode(composeYaml);
      setError(null);
    } catch (err) {
      setError(`Conversion error: ${err instanceof Error ? err.message : 'Invalid docker run command'}`);
    }
  }, []);

  // Debounced conversion effect
  useEffect(() => {
    if (activeEditor === null) return;

    // Clear any existing timer
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new timer
    debounceTimerRef.current = window.setTimeout(() => {
      if (activeEditor === 'compose') {
        convertComposeToRun(composeCode);
      } else if (activeEditor === 'run') {
        convertRunToCompose(dockerRunCode);
      }
    }, 300);

    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [composeCode, dockerRunCode, activeEditor, convertComposeToRun, convertRunToCompose]);

  const handleComposeChange = useCallback((value: string) => {
    setComposeCode(value);
    setActiveEditor('compose');
  }, []);

  const handleDockerRunChange = useCallback((value: string) => {
    setDockerRunCode(value);
    setActiveEditor('run');
  }, []);

  const loadSimple = useCallback(() => {
    setComposeCode(SIMPLE_EXAMPLE);
    setActiveEditor('compose');
  }, []);

  const loadComplex = useCallback(() => {
    setComposeCode(COMPLEX_EXAMPLE);
    setActiveEditor('compose');
  }, []);

  const clearAll = useCallback(() => {
    setComposeCode('');
    setDockerRunCode('');
    setActiveEditor(null);
    setError(null);
  }, []);

  const getFeedbackMessage = () => {
    if (error) return error;
    if (!composeCode.trim() && !dockerRunCode.trim()) {
      return 'Type in either editor to see the conversion in real-time';
    }
    return null;
  };

  const getFeedbackStyle = () => {
    if (error) {
      return 'border border-red-500/50 bg-red-500/10 dark:bg-red-900/30 text-red-700 dark:text-red-200';
    }
    if (!composeCode.trim() && !dockerRunCode.trim()) {
      return 'border border-blue-500/50 bg-blue-500/10 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200';
    }
    return 'border border-green-500/50 bg-green-500/10 dark:bg-green-900/30 text-green-700 dark:text-green-200';
  };

  const feedbackMessage = getFeedbackMessage();

  return (
    <div className="aside-tall">
      <div className="border-content/20 bg-bkg sticky top-20 my-4 flex flex-col gap-3 rounded-lg border p-2 shadow-lg">
        {/* Docker Compose Editor */}
        <div>
          <div className="text-content/75 mb-2 text-sm font-medium">Docker Compose (YAML)</div>
          <CodeMirror
            value={composeCode}
            theme={isDark ? vscodeDark : vscodeLight}
            extensions={[yaml()]}
            onChange={handleComposeChange}
            basicSetup={{
              lineNumbers: true,
              highlightActiveLineGutter: false,
              highlightSpecialChars: true,
              foldGutter: false,
              drawSelection: true,
              dropCursor: true,
              allowMultipleSelections: true,
              indentOnInput: true,
              bracketMatching: true,
              closeBrackets: true,
              autocompletion: true,
              rectangularSelection: true,
              crosshairCursor: false,
              highlightActiveLine: true,
              highlightSelectionMatches: true,
              closeBracketsKeymap: true,
              searchKeymap: true,
              foldKeymap: true,
              completionKeymap: true,
              lintKeymap: true
            }}
          />
        </div>

        {/* Docker Run Editor */}
        <div>
          <div className="text-content/75 mb-2 py-2 text-sm font-medium">Docker Run (Commands)</div>
          <CodeMirror
            value={dockerRunCode}
            theme={isDark ? vscodeDark : vscodeLight}
            extensions={[StreamLanguage.define(shell), EditorView.lineWrapping]}
            onChange={handleDockerRunChange}
            basicSetup={{
              lineNumbers: false,
              highlightActiveLineGutter: false,
              highlightSpecialChars: true,
              foldGutter: false,
              drawSelection: true,
              dropCursor: true,
              allowMultipleSelections: true,
              indentOnInput: true,
              bracketMatching: true,
              closeBrackets: true,
              autocompletion: true,
              rectangularSelection: true,
              crosshairCursor: false,
              highlightActiveLine: true,
              highlightSelectionMatches: true,
              closeBracketsKeymap: true,
              searchKeymap: true,
              foldKeymap: true,
              completionKeymap: true,
              lintKeymap: true
            }}
          />
        </div>

        {/* Feedback Area - only show if there's a message */}
        {feedbackMessage && <div className={`rounded-md p-3 text-sm ${getFeedbackStyle()}`}>{feedbackMessage}</div>}

        {/* Action Buttons - Bottom Right */}
        <div className="flex justify-end gap-2">
          <button
            onClick={loadSimple}
            className="bg-content/10 hover:bg-content/20 text-content rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
          >
            Load Simple
          </button>
          <button
            onClick={loadComplex}
            className="bg-content/10 hover:bg-content/20 text-content rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
          >
            Load Complex
          </button>
          <button
            onClick={clearAll}
            className="bg-content/10 hover:bg-content/20 text-content rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}

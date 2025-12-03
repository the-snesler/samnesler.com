import { useCallback, useState, useEffect } from 'preact/hooks';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile';
import { vscodeDark, vscodeLight } from '@uiw/codemirror-theme-vscode';

interface Challenge {
  id: number;
  title: string;
  description: string;
  initialCode: string;
  validate: (code: string) => { isValid: boolean; feedback: string };
}

const challenges: Challenge[] = [
  {
    id: 1,
    title: 'Challenge 1: Base Image',
    description: 'Start with a base image. Use the FROM instruction to specify node:18-alpine as your base image.',
    initialCode: '# Write your Dockerfile here\n',
    validate: (code: string) => {
      const lines = code.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
      const hasFrom = lines.some(line => line.trim().toUpperCase().startsWith('FROM'));
      const hasNode = code.toLowerCase().includes('node');

      if (!hasFrom) {
        return { isValid: false, feedback: 'Missing FROM instruction. Every Dockerfile must start with a FROM instruction.' };
      }
      if (!hasNode) {
        return { isValid: false, feedback: 'Try using a Node.js base image (hint: node:18-alpine)' };
      }
      return { isValid: true, feedback: "Great! You've specified a base image. Click Next to continue." };
    }
  },
  {
    id: 2,
    title: 'Challenge 2: Working Directory',
    description: 'Set the working directory inside the container using the WORKDIR instruction. Use /app as the directory.',
    initialCode: 'FROM node:18-alpine\n\n# Set the working directory\n',
    validate: (code: string) => {
      const hasFrom = code.toUpperCase().includes('FROM');
      const hasWorkdir = code.toUpperCase().includes('WORKDIR');
      const hasApp = code.includes('/app');

      if (!hasFrom) {
        return { isValid: false, feedback: "Don't forget the FROM instruction from the previous challenge!" };
      }
      if (!hasWorkdir) {
        return { isValid: false, feedback: 'Missing WORKDIR instruction. Use it to set the working directory.' };
      }
      if (!hasApp) {
        return { isValid: false, feedback: 'Set the working directory to /app' };
      }
      return { isValid: true, feedback: "Perfect! You've set the working directory. Click Next to continue." };
    }
  },
  {
    id: 3,
    title: 'Challenge 3: Copy Files',
    description: 'Copy your package.json file into the container using the COPY instruction.',
    initialCode: 'FROM node:18-alpine\nWORKDIR /app\n\n# Copy package.json\n',
    validate: (code: string) => {
      const hasCopy = code.toUpperCase().includes('COPY');
      const hasPackageJson = code.toLowerCase().includes('package.json');

      if (!hasCopy) {
        return { isValid: false, feedback: 'Missing COPY instruction. Use it to copy files into the container.' };
      }
      if (!hasPackageJson) {
        return { isValid: false, feedback: 'Copy the package.json file into the container.' };
      }
      return { isValid: true, feedback: 'Excellent! Files are now copied. Click Next to continue.' };
    }
  },
  {
    id: 4,
    title: 'Challenge 4: Install Dependencies',
    description: 'Run npm install to install dependencies using the RUN instruction.',
    initialCode: 'FROM node:18-alpine\nWORKDIR /app\nCOPY package.json .\n\n# Install dependencies\n',
    validate: (code: string) => {
      const hasRun = code.toUpperCase().includes('RUN');
      const hasNpmInstall = code.toLowerCase().includes('npm install') || code.toLowerCase().includes('npm i');

      if (!hasRun) {
        return { isValid: false, feedback: 'Missing RUN instruction. Use it to execute commands during the build.' };
      }
      if (!hasNpmInstall) {
        return { isValid: false, feedback: 'Run npm install to install your dependencies.' };
      }
      return { isValid: true, feedback: 'Great! Dependencies will be installed. Click Next to continue.' };
    }
  },
  {
    id: 5,
    title: 'Challenge 5: Copy Application Code',
    description: 'Copy the rest of your application code. Use COPY . . to copy everything.',
    initialCode: 'FROM node:18-alpine\nWORKDIR /app\nCOPY package.json .\nRUN npm install\n\n# Copy application code\n',
    validate: (code: string) => {
      const copyLines = code.split('\n').filter(line => line.trim().toUpperCase().startsWith('COPY'));
      const hasTwoCopies = copyLines.length >= 2;
      const hasCopyAll = code.includes('COPY . .');

      if (!hasTwoCopies) {
        return { isValid: false, feedback: 'Add another COPY instruction to copy all application files.' };
      }
      if (!hasCopyAll) {
        return { isValid: false, feedback: 'Use COPY . . to copy all files from the current directory.' };
      }
      return { isValid: true, feedback: 'Perfect! All your code is now in the container. Click Next to continue.' };
    }
  },
  {
    id: 6,
    title: 'Challenge 6: Define the Command',
    description: 'Finally, specify the command to run when the container starts using CMD. Run node index.js.',
    initialCode: 'FROM node:18-alpine\nWORKDIR /app\nCOPY package.json .\nRUN npm install\nCOPY . .\n\n# Define the startup command\n',
    validate: (code: string) => {
      const hasCmd = code.toUpperCase().includes('CMD') || code.toUpperCase().includes('ENTRYPOINT');
      const hasNode = code.toLowerCase().includes('node');

      if (!hasCmd) {
        return { isValid: false, feedback: 'Missing CMD instruction. Use it to specify what command runs when the container starts.' };
      }
      if (!hasNode) {
        return { isValid: false, feedback: 'Run node with your application file (e.g., node index.js).' };
      }
      return { isValid: true, feedback: "🎉 Congratulations! You've created your first complete Dockerfile!" };
    }
  }
];

export default function DockerfilePlayground() {
  const [currentChallenge, setCurrentChallenge] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [isValid, setIsValid] = useState(false);
  const [code, setCode] = useState('');
  const [isDark, setIsDark] = useState(true);

  const challenge = challenges[currentChallenge];

  // Detect theme changes
  useEffect(() => {
    const checkTheme = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };

    checkTheme();

    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, []);

  const validateCode = useCallback(
    (code: string) => {
      const result = challenge.validate(code);
      setFeedback(result.feedback);
      setIsValid(result.isValid);
    },
    [challenge]
  );

  useEffect(() => {
    setCode(challenge.initialCode);
    validateCode(challenge.initialCode);
  }, [currentChallenge, challenge, validateCode]);

  const handleCodeChange = useCallback(
    (value: string) => {
      setCode(value);
      validateCode(value);
    },
    [validateCode]
  );

  const handleNext = () => {
    if (currentChallenge < challenges.length - 1) {
      setCurrentChallenge(prev => prev + 1);
      setFeedback('');
      setIsValid(false);
    }
  };

  const handlePrev = () => {
    if (currentChallenge > 0) {
      setCurrentChallenge(prev => prev - 1);
      setFeedback('');
      setIsValid(false);
    }
  };

  const handleReset = () => {
    setCode(challenge.initialCode);
    validateCode(challenge.initialCode);
  };

  return (
    <div className="aside-tall">
      <div className="sticky top-20 flex flex-col gap-4 rounded-lg border border-content/20 bg-bkg shadow-lg p-6">
        <div>
          <h3 className="text-xl font-semibold text-content">{challenge.title}</h3>
          <p className="mt-2 text-sm text-content/75">{challenge.description}</p>
        </div>

        <CodeMirror
          value={code}
          height="300px"
          theme={isDark ? vscodeDark : vscodeLight}
          extensions={[StreamLanguage.define(dockerFile)]}
          onChange={handleCodeChange}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLineGutter: true,
            highlightSpecialChars: true,
            foldGutter: true,
            drawSelection: true,
            dropCursor: true,
            allowMultipleSelections: true,
            indentOnInput: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true,
            rectangularSelection: true,
            crosshairCursor: true,
            highlightActiveLine: true,
            highlightSelectionMatches: true,
            closeBracketsKeymap: true,
            searchKeymap: true,
            foldKeymap: true,
            completionKeymap: true,
            lintKeymap: true
          }}
        />

        <div
          className={`rounded-md p-3 text-sm ${isValid ? 'border border-green-500/50 bg-green-500/10 dark:bg-green-900/30 text-green-700 dark:text-green-200' : 'border border-blue-500/50 bg-blue-500/10 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200'}`}
        >
          {feedback || 'Start writing your Dockerfile...'}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={handlePrev}
              disabled={currentChallenge === 0}
              className="rounded-md bg-content/10 hover:bg-content/20 px-4 py-2 text-sm font-medium text-content transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={handleNext}
              disabled={currentChallenge === challenges.length - 1 || !isValid}
              className="rounded-md bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
          <button onClick={handleReset} className="rounded-md bg-content/10 hover:bg-content/20 px-4 py-2 text-sm font-medium text-content transition-colors">
            Reset
          </button>
        </div>

        <div className="text-center text-xs text-content/60">
          Challenge {currentChallenge + 1} of {challenges.length}
        </div>
      </div>
    </div>
  );
}

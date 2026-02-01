import { useState, useEffect } from 'react';
import DoctorLayout from '@/components/layout/DoctorLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  CheckCircle2,
  XCircle,
  Key,
  ExternalLink,
  Copy,
  Loader2,
  Brain,
  FileText,
  Shield,
} from 'lucide-react';
import { toast } from 'sonner';

const REQUIRED_PROMPT_IDS = [
  {
    id: 'docassist_history_extraction',
    name: 'History Extraction',
    description: 'Converts unstructured patient notes to structured JSON',
    variables: ['raw_notes'],
  },
  {
    id: 'docassist_relevance_filtering',
    name: 'Relevance Filtering',
    description: 'Filters extracted history based on chief complaint',
    variables: ['history_json', 'complaint'],
  },
  {
    id: 'docassist_clinical_reasoning',
    name: 'Clinical Reasoning',
    description: 'Generates chain-of-thought clinical analysis',
    variables: ['filtered_data', 'complaint'],
  },
  {
    id: 'docassist_synthesis',
    name: 'Synthesis',
    description: 'Creates final physician-facing report',
    variables: ['reasoning_chain'],
  },
];

export default function KeywordsSetupPage() {
  const [apiKey, setApiKey] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [envKeyExists, setEnvKeyExists] = useState(false);

  useEffect(() => {
    // Check if API key is already configured
    const existingKey = import.meta.env.VITE_KEYWORDS_AI_API_KEY;
    if (existingKey) {
      setEnvKeyExists(true);
      setApiKey('••••••••••••••••');
      setIsValid(true);
    }
  }, []);

  const validateApiKey = async () => {
    if (!apiKey || apiKey === '••••••••••••••••') {
      toast.error('Please enter a valid API key');
      return;
    }

    setIsValidating(true);
    try {
      // Make a simple request to Keywords AI to validate the key
      const response = await fetch('https://api.keywordsai.co/api/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-5.2',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1,
        }),
      });

      if (response.ok || response.status === 429) {
        // 429 means rate limited but key is valid
        setIsValid(true);
        toast.success('API key is valid!');
      } else if (response.status === 401) {
        setIsValid(false);
        toast.error('Invalid API key');
      } else {
        setIsValid(null);
        toast.error(`Unexpected response: ${response.status}`);
      }
    } catch (error) {
      setIsValid(false);
      toast.error('Failed to validate API key');
    } finally {
      setIsValidating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <DoctorLayout
      breadcrumbs={[
        { label: 'Dashboard', href: '/doctor' },
        { label: 'Keywords AI Setup' },
      ]}
    >
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Key className="h-6 w-6 text-primary" />
            Keywords AI Setup
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure your Keywords AI integration for the clinical pipeline
          </p>
        </div>

        {/* API Key Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              API Key Configuration
            </CardTitle>
            <CardDescription>
              Your Keywords AI API key is used for all LLM operations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {envKeyExists ? (
              <Alert>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <AlertTitle>API Key Configured</AlertTitle>
                <AlertDescription>
                  Your API key is set via environment variable (VITE_KEYWORDS_AI_API_KEY)
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    placeholder="Enter your Keywords AI API key"
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      setIsValid(null);
                    }}
                  />
                  <Button onClick={validateApiKey} disabled={isValidating}>
                    {isValidating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Validate'
                    )}
                  </Button>
                </div>

                {isValid === true && (
                  <Alert>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <AlertTitle>Valid API Key</AlertTitle>
                    <AlertDescription>
                      Add this to your .env file: VITE_KEYWORDS_AI_API_KEY={apiKey}
                    </AlertDescription>
                  </Alert>
                )}

                {isValid === false && (
                  <Alert variant="destructive">
                    <XCircle className="h-4 w-4" />
                    <AlertTitle>Invalid API Key</AlertTitle>
                    <AlertDescription>
                      Please check your API key and try again
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}

            <Button variant="outline" asChild className="w-full">
              <a
                href="https://keywordsai.co/dashboard"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Keywords AI Dashboard
              </a>
            </Button>
          </CardContent>
        </Card>

        {/* Required Prompts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Required Managed Prompts
            </CardTitle>
            <CardDescription>
              Create these prompts in your Keywords AI dashboard for the clinical pipeline
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {REQUIRED_PROMPT_IDS.map((prompt, index) => (
                <div
                  key={prompt.id}
                  className="border rounded-lg p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono">
                        Stage {index + 1}
                      </Badge>
                      <span className="font-medium">{prompt.name}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(prompt.id)}
                    >
                      <Copy className="h-4 w-4 mr-1" />
                      Copy ID
                    </Button>
                  </div>
                  
                  <p className="text-sm text-muted-foreground">
                    {prompt.description}
                  </p>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Prompt ID:</span>
                    <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                      {prompt.id}
                    </code>
                  </div>
                  
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">Variables:</span>
                    {prompt.variables.map((v) => (
                      <Badge key={v} variant="secondary" className="text-xs font-mono">
                        {`{{${v}}}`}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Documentation Link */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Documentation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              For detailed setup instructions and example prompt templates, see the integration documentation.
            </p>
            <Button variant="outline" asChild>
              <a
                href="https://docs.keywordsai.co/features/prompt-management"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Keywords AI Prompt Management Docs
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </DoctorLayout>
  );
}

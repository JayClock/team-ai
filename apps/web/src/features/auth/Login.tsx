import { Button } from '@shared/ui/components/button';
import { Card } from '@shared/ui/components/card';
import { Github } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSuspenseResource } from '@hateoas-ts/resource-react';
import { rootResource } from '../../lib/api-client';
import { useEffect } from 'react';

export function Login() {
  const { resourceState: rootState } = useSuspenseResource(rootResource);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const loginLink = rootState.getLink('login');

  useEffect(() => {
    if (!loginLink) {
      navigate('/');
    }
  }, [loginLink, navigate]);

  const handleGithubLogin = () => {
    if (loginLink?.href) {
      const returnTo = searchParams.get('return_to') || '/';
      const redirectParam = encodeURIComponent(returnTo);
      window.location.href = `${loginLink.href}?redirect_uri=${redirectParam}`;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <Card className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Team AI</h1>
          <p className="text-gray-500">使用 GitHub 账号登录</p>
        </div>

        <Button
          className="w-full h-12"
          onClick={handleGithubLogin}
          disabled={!loginLink}
        >
          <div className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            GitHub 登录
          </div>
        </Button>
      </Card>
    </div>
  );
}

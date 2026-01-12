import { Button } from '@shared/ui/components/button';
import { Card } from '@shared/ui/components/card';
import { Spinner } from '@shared/ui/components/spinner';
import { Github } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useClient, useResource } from '@hateoas-ts/resource-react';
import { rootResource } from '../../lib/api-client';

export function Login() {
  const client = useClient();
  const [loginHref, setLoginHref] = useState<string>('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  useResource(rootResource);

  useEffect(() => {
    const fetchLoginLink = async () => {
      const rootState = await rootResource.withGet().request();
      const loginLink = rootState.getLink('login')?.href;
      if (loginLink) {
        setLoginHref(loginLink);
      } else {
        navigate('/');
      }
    };

    fetchLoginLink().then();
  }, [client, navigate]);

  const handleGithubLogin = () => {
    if (loginHref) {
      const returnTo = searchParams.get('return_to') || '/';
      const redirectParam = encodeURIComponent(returnTo);
      window.location.href = `${loginHref}?redirect_uri=${redirectParam}`;
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
          disabled={!loginHref}
        >
          {!loginHref ? (
            <div className="flex items-center gap-2">
              <Spinner className="h-4 w-4" />
              加载中...
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Github className="h-5 w-5" />
              GitHub 登录
            </div>
          )}
        </Button>
      </Card>
    </div>
  );
}

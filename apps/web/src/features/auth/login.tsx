import { Button } from '@shared/ui/components/button';
import { Card } from '@shared/ui/components/card';
import { Github } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSuspenseResource } from '@hateoas-ts/resource-react';
import { rootResource } from '../../lib/api-client';
import { FormEvent, useEffect, useMemo, useState } from 'react';

export function Login() {
  const { resourceState: rootState } = useSuspenseResource(rootResource);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loginLink = rootState.getLink('login');
  const githubLoginLink = rootState.getLink('login-oauth-github');
  const returnTo = useMemo(() => searchParams.get('return_to') || '/', [searchParams]);

  useEffect(() => {
    if (!loginLink) {
      navigate('/');
    }
  }, [loginLink, navigate]);

  const handleLocalLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!loginLink?.href || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(loginLink.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        setError('用户名或密码错误');
        return;
      }

      navigate(returnTo, { replace: true });
    } catch {
      setError('登录失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGithubLogin = () => {
    if (githubLoginLink?.href) {
      const redirectParam = encodeURIComponent(returnTo);
      window.location.href = `${githubLoginLink.href}?redirect_uri=${redirectParam}`;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <Card className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Team AI</h1>
          <p className="text-gray-500">使用本地账号登录</p>
        </div>

        <form className="space-y-4" onSubmit={handleLocalLogin}>
          <div className="space-y-2">
            <label className="block text-sm text-gray-600" htmlFor="username">
              用户名
            </label>
            <input
              id="username"
              className="w-full h-10 px-3 border rounded-md"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              maxLength={255}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm text-gray-600" htmlFor="password">
              密码
            </label>
            <input
              id="password"
              className="w-full h-10 px-3 border rounded-md"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              maxLength={255}
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <Button className="w-full h-12" type="submit" disabled={!loginLink || submitting}>
            {submitting ? '登录中...' : '账号密码登录'}
          </Button>
        </form>

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-gray-500">或</span>
          </div>
        </div>

        <Button
          className="w-full h-12"
          onClick={handleGithubLogin}
          disabled={!githubLoginLink}
          variant="outline"
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

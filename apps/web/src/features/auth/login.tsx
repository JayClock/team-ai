import { Button } from '@shared/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared/ui/components/card';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@shared/ui/components/field';
import { Input } from '@shared/ui/components/input';
import { Github } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useResource } from '@hateoas-ts/resource-react';
import { rootResource } from '../../lib/api-client';
import { FormEvent, useEffect, useMemo, useState } from 'react';

export function Login() {
  const { loading, error: rootError, resourceState: rootState } =
    useResource(rootResource);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loginLink = rootState?.getLink('login');
  const githubLoginLink = rootState?.getLink('login-oauth-github');
  const returnTo = useMemo(() => searchParams.get('return_to') || '/', [searchParams]);

  useEffect(() => {
    if (!loading && !rootError && !loginLink) {
      navigate('/');
    }
  }, [loading, loginLink, navigate, rootError]);

  if (loading) {
    return null;
  }

  if (rootError) {
    return (
      <div className="bg-muted/50 flex min-h-screen items-center justify-center p-6 md:p-10">
        <div className="text-muted-foreground text-sm">加载登录信息失败，请稍后重试</div>
      </div>
    );
  }

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
      const oauthLoginUrl = new URL(githubLoginLink.href, window.location.origin);
      oauthLoginUrl.searchParams.set('return_to', returnTo);
      window.location.href = oauthLoginUrl.toString();
    }
  };

  return (
    <div className="bg-muted/50 flex min-h-screen items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">登录 Team AI</CardTitle>
            <CardDescription>使用本地账号或 GitHub 登录</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLocalLogin}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="username">用户名</FieldLabel>
                  <Input
                    id="username"
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    required
                    maxLength={255}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="password">密码</FieldLabel>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={8}
                    maxLength={255}
                  />
                </Field>

                {error ? <FieldError>{error}</FieldError> : null}

                <Field className="gap-3">
                  <Button
                    type="submit"
                    disabled={!loginLink || submitting}
                    className="w-full"
                  >
                    {submitting ? '登录中...' : '账号密码登录'}
                  </Button>
                  <Button
                    variant="outline"
                    type="button"
                    onClick={handleGithubLogin}
                    disabled={!githubLoginLink}
                    className="w-full"
                  >
                    <Github className="size-4" />
                    GitHub 登录
                  </Button>
                  <FieldDescription className="text-center">
                    登录后将跳转到请求页面
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

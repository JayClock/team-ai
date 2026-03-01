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
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useResource } from '@hateoas-ts/resource-react';
import { rootResource } from '../../lib/api-client';

export function Signup() {
  const { loading, error: rootError, resourceState: rootState } =
    useResource(rootResource);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loginLink = rootState?.getLink('login');
  const registerUrl = useMemo(
    () => loginLink?.href?.replace('/auth/login', '/auth/register') ?? null,
    [loginLink]
  );
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
        <div className="text-muted-foreground text-sm">加载注册信息失败，请稍后重试</div>
      </div>
    );
  }

  const handleSignup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!registerUrl || submitting) {
      return;
    }

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(registerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, email, username, password }),
      });

      if (!response.ok) {
        if (response.status === 409) {
          setError('用户名或邮箱已被使用');
          return;
        }
        setError('注册失败，请稍后重试');
        return;
      }

      navigate(returnTo, { replace: true });
    } catch {
      setError('注册失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-muted/50 flex min-h-screen items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle>注册 Team AI 账号</CardTitle>
            <CardDescription>填写以下信息创建账号</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignup}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="name">姓名</FieldLabel>
                  <Input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    maxLength={255}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="email">邮箱</FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    maxLength={255}
                  />
                  <FieldDescription>我们将使用该邮箱与你联系</FieldDescription>
                </Field>

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
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={8}
                    maxLength={255}
                  />
                  <FieldDescription>密码至少 8 位</FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="confirm-password">确认密码</FieldLabel>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                    minLength={8}
                    maxLength={255}
                  />
                </Field>

                {error ? <FieldError>{error}</FieldError> : null}

                <Field className="gap-3">
                  <Button type="submit" disabled={!registerUrl || submitting} className="w-full">
                    {submitting ? '注册中...' : '创建账号'}
                  </Button>
                  <FieldDescription className="px-6 text-center">
                    已有账号？ <Link to="/login">去登录</Link>
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

import { Button, Card, message } from 'antd';
import { GithubOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { rootResource } from './client';

export function Login() {
  const [loginHref, setLoginHref] = useState<string>('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchLoginLink = async () => {
      try {
        const rootState = await rootResource.withGet().request();

        const loginLink = rootState.getLink('login')?.href
        if (loginLink) {
          setLoginHref(loginLink);
        } else {
          navigate('/');
        }
      } catch (error) {
        message.error('获取登录链接失败，请稍后重试');
      }
    };

    fetchLoginLink().then();
  }, [navigate]);

  const handleGithubLogin = () => {
    if (loginHref) {
      window.location.href = loginHref;
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
          type="primary"
          icon={<GithubOutlined />}
          size="large"
          block
          onClick={handleGithubLogin}
          disabled={!loginHref}
          loading={!loginHref}
        >
          GitHub 登录
        </Button>
      </Card>
    </div>
  );
}

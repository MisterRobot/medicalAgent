export const getApiBase = () => {
  if (typeof window !== 'undefined') {
    const env = process.env.NEXT_PUBLIC_API_URL;
    const { protocol, hostname } = window.location;
    if (env) {
      if (hostname === 'localhost' || hostname === '127.0.0.1') return env;
      try {
        const u = new URL(env);
        if (u.hostname === hostname) return env;
      } catch {}
    }
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${protocol}//${hostname}:8000`;
    }
    return `${protocol}//${hostname}`;
  }
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
};

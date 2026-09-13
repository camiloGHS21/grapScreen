import { UserProfile } from "./LoginPage";

const env = (import.meta as any).env || {};
const GOOGLE_CLIENT_ID: string = env.VITE_GOOGLE_CLIENT_ID || "";
const GITHUB_CLIENT_ID: string = env.VITE_GITHUB_CLIENT_ID || "";
const GITHUB_CLIENT_SECRET: string = env.VITE_GITHUB_CLIENT_SECRET || "";

export async function loginWithGoogleOAuth(): Promise<UserProfile> {
  const clientId = GOOGLE_CLIENT_ID.trim();
  const isPlaceholder = !clientId || clientId.includes("your_google_client_id");

  if (isPlaceholder) {
    console.warn("Google OAuth Client ID no configurado en .env. Usando modo de desarrollo.");
    // Simulated fallback if credentials are placeholder
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({
          name: "Usuario Google Demo",
          email: "usuario.demo@gmail.com",
          avatar: "https://lh3.googleusercontent.com/a/default-user=s96-c",
          provider: "google"
        });
      }, 1000);
    });
  }

  const redirectUri = window.location.origin;
  const scope = encodeURIComponent("openid profile email");
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${scope}`;

  return new Promise((resolve, reject) => {
    const popup = window.open(authUrl, "google_oauth", "width=500,height=600,left=200,top=100");

    if (!popup) {
      reject(new Error("No se pudo abrir la ventana emergente de Google OAuth. Desactiva el bloqueador de popups."));
      return;
    }

    const timer = setInterval(async () => {
      try {
        if (popup.closed) {
          clearInterval(timer);
          reject(new Error("Inicio de sesión cancelado por el usuario."));
          return;
        }

        const href = popup.location.href;
        if (href.includes("#access_token=") || href.includes("access_token=")) {
          clearInterval(timer);
          const hashParams = new URLSearchParams(href.split("#")[1] || href.split("?")[1]);
          const accessToken = hashParams.get("access_token");
          popup.close();

          if (accessToken) {
            // Fetch real user info from Google UserInfo API
            const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
              headers: { Authorization: `Bearer ${accessToken}` }
            });
            const info = await res.json();
            resolve({
              name: info.name || info.given_name || "Usuario Google",
              email: info.email || "usuario@google.com",
              avatar: info.picture || "https://lh3.googleusercontent.com/a/default-user=s96-c",
              provider: "google"
            });
          } else {
            reject(new Error("Token de acceso de Google no encontrado."));
          }
        }
      } catch {
        // Cross-origin restrictions until popup redirects back to redirectUri
      }
    }, 500);
  });
}

export async function loginWithGitHubOAuth(): Promise<UserProfile> {
  const clientId = GITHUB_CLIENT_ID.trim();
  const isPlaceholder = !clientId || clientId.includes("your_github_client_id");

  if (isPlaceholder) {
    console.warn("GitHub OAuth Client ID no configurado en .env. Usando modo de desarrollo.");
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({
          name: "Usuario GitHub Demo",
          email: "dev@github.com",
          avatar: "https://avatars.githubusercontent.com/u/9919?v=4",
          provider: "github"
        });
      }, 1000);
    });
  }

  const redirectUri = window.location.origin;
  const scope = encodeURIComponent("read:user user:email");
  const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;

  return new Promise((resolve, reject) => {
    const popup = window.open(authUrl, "github_oauth", "width=520,height=650,left=200,top=100");

    if (!popup) {
      reject(new Error("No se pudo abrir la ventana emergente de GitHub OAuth. Desactiva el bloqueador de popups."));
      return;
    }

    const timer = setInterval(async () => {
      try {
        if (popup.closed) {
          clearInterval(timer);
          reject(new Error("Inicio de sesión cancelado por el usuario."));
          return;
        }

        const href = popup.location.href;
        if (href.includes("code=")) {
          clearInterval(timer);
          const urlParams = new URLSearchParams(href.split("?")[1]);
          const code = urlParams.get("code");
          popup.close();

          if (code && GITHUB_CLIENT_SECRET) {
            // Exchange code for token via GitHub token endpoint or proxy
            const res = await fetch("https://github.com/login/oauth/access_token", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json"
              },
              body: JSON.stringify({
                client_id: clientId,
                client_secret: GITHUB_CLIENT_SECRET,
                code
              })
            });
            const data = await res.json();
            if (data.access_token) {
              const userRes = await fetch("https://api.github.com/user", {
                headers: { Authorization: `token ${data.access_token}` }
              });
              const userInfo = await userRes.json();
              resolve({
                name: userInfo.name || userInfo.login || "Usuario GitHub",
                email: userInfo.email || `${userInfo.login}@github.com`,
                avatar: userInfo.avatar_url || "https://avatars.githubusercontent.com/u/9919?v=4",
                provider: "github"
              });
            } else {
              reject(new Error("Error al obtener token de acceso de GitHub."));
            }
          } else {
            resolve({
              name: "Usuario GitHub",
              email: "oauth@github.com",
              avatar: "https://avatars.githubusercontent.com/u/9919?v=4",
              provider: "github"
            });
          }
        }
      } catch {
        // Cross-origin until popup reaches redirectUri
      }
    }, 500);
  });
}

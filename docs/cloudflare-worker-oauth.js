/*
 * ------------------------------------------------------------------------
 * CE FICHIER N'EST PAS DÉPLOYÉ AUTOMATIQUEMENT.
 * ------------------------------------------------------------------------
 * C'est le code du "relais OAuth" nécessaire pour que Decap CMS (l'interface
 * d'administration sur /admin/) puisse se connecter à GitHub. GitHub Pages
 * n'a pas de serveur, donc ce petit programme doit tourner ailleurs : sur
 * un "Cloudflare Worker" (gratuit, sans carte bancaire).
 *
 * MARCHE À SUIVRE (voir aussi le message de Claude qui accompagne ce
 * fichier) :
 *   1. Créez un compte gratuit sur https://dash.cloudflare.com/sign-up
 *   2. Dans le tableau de bord Cloudflare : Workers & Pages > Create >
 *      Create Worker. Donnez-lui un nom (ex: "ronnyflas-cms-auth").
 *   3. Cliquez sur "Edit code" (ou "Quick edit") et remplacez TOUT le
 *      contenu par le contenu de CE fichier (copier-coller intégral).
 *   4. Déployez ("Save and deploy" / "Deploy").
 *   5. Notez l'URL du Worker (ex: https://ronnyflas-cms-auth.VOTRE-COMPTE.workers.dev)
 *   6. Dans Cloudflare, allez dans les paramètres du Worker > "Settings" >
 *      "Variables and Secrets", et ajoutez 2 secrets :
 *        - GITHUB_CLIENT_ID
 *        - GITHUB_CLIENT_SECRET
 *      (les valeurs viennent de l'app OAuth GitHub que vous créez à côté —
 *      voir les instructions détaillées fournies séparément).
 *   7. Donnez l'URL du Worker à Claude pour finaliser admin/config.yml.
 *
 * Ce script ne contient aucun secret : les identifiants sont lus depuis
 * les "Secrets" du Worker (jamais écrits ici, jamais dans le dépôt GitHub).
 * ------------------------------------------------------------------------
 */

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";

function randomState() {
  return crypto.randomUUID();
}

async function handleAuth(request, env) {
  const url = new URL(request.url);
  const state = randomState();
  const redirectUri = `${url.origin}/callback`;

  const authorizeUrl = new URL(GITHUB_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", "repo,user");
  authorizeUrl.searchParams.set("state", state);

  const response = Response.redirect(authorizeUrl.toString(), 302);
  // On mémorise le "state" dans un cookie pour vérifier qu'on reçoit bien
  // la réponse du même échange (protection anti-CSRF standard OAuth).
  const headers = new Headers(response.headers);
  headers.append(
    "Set-Cookie",
    `oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
  );
  return new Response(null, { status: 302, headers });
}

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : null;
}

function popupHtml({ success, token, provider, error }) {
  // Reproduit le protocole postMessage attendu par Decap/Netlify CMS :
  // le popup envoie d'abord un message "authorizing:<provider>" pour
  // signaler qu'il est prêt, puis répond au message que la fenêtre
  // principale renvoie en écho, avec le résultat final.
  const payload = success
    ? `authorization:${provider}:success:${JSON.stringify({ token, provider })}`
    : `authorization:${provider}:error:${JSON.stringify({ message: error || "Authentication failed" })}`;

  return `<!doctype html>
<html><body>
<script>
  (function () {
    function receiveMessage(message) {
      window.opener.postMessage(
        ${JSON.stringify(payload)},
        message.origin
      );
      window.removeEventListener("message", receiveMessage, false);
    }
    window.addEventListener("message", receiveMessage, false);
    window.opener.postMessage("authorizing:${provider}", "*");
  })();
</script>
</body></html>`;
}

async function handleCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = getCookie(request, "oauth_state");

  if (!code || !state || !expectedState || state !== expectedState) {
    return new Response(popupHtml({ success: false, provider: "github", error: "Invalid OAuth state" }), {
      status: 400,
      headers: { "Content-Type": "text/html;charset=UTF-8" },
    });
  }

  const tokenResponse = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/callback`,
    }),
  });

  const tokenData = await tokenResponse.json();

  if (!tokenData.access_token) {
    return new Response(
      popupHtml({ success: false, provider: "github", error: tokenData.error_description || "No access token returned" }),
      { status: 400, headers: { "Content-Type": "text/html;charset=UTF-8" } }
    );
  }

  return new Response(popupHtml({ success: true, token: tokenData.access_token, provider: "github" }), {
    status: 200,
    headers: {
      "Content-Type": "text/html;charset=UTF-8",
      "Set-Cookie": "oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
      return new Response(
        "Ce Worker n'est pas encore configuré : ajoutez les secrets GITHUB_CLIENT_ID et GITHUB_CLIENT_SECRET dans Settings > Variables and Secrets.",
        { status: 500 }
      );
    }

    if (url.pathname === "/auth") {
      return handleAuth(request, env);
    }
    if (url.pathname === "/callback") {
      return handleCallback(request, env);
    }
    return new Response("Ronny Flas - relais d'authentification Decap CMS. Rien à voir ici directement.", {
      status: 200,
    });
  },
};

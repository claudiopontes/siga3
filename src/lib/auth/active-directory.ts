import { Client } from "ldapts";

export type ActiveDirectoryUser = {
  username: string;
  displayName?: string;
  email?: string;
  groups: string[];
};

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} não configurado.`);
  }

  return value;
}

function escapeLdapFilter(value: string) {
  return value.replace(/[\\*()\0]/g, (char) => {
    switch (char) {
      case "\\":
        return "\\5c";
      case "*":
        return "\\2a";
      case "(":
        return "\\28";
      case ")":
        return "\\29";
      case "\0":
        return "\\00";
      default:
        return char;
    }
  });
}

function normalizeValues(value: unknown) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map(String);
  }

  return [String(value)];
}

function logGroupDiagnostic(username: string, userGroups: string[]) {
  if (process.env.AD_DEBUG_GROUPS !== "true") {
    return;
  }

  console.warn("[AD] Usuário autenticado:", username);
  console.warn("[AD] Grupos retornados pelo AD para o usuário:", userGroups);
}

async function getDefaultNamingContext(client: Client) {
  const configuredBaseDn = process.env.AD_BASE_DN;

  if (configuredBaseDn) {
    return configuredBaseDn;
  }

  const { searchEntries } = await client.search("", {
    scope: "base",
    attributes: ["defaultNamingContext"],
  });

  const defaultNamingContext = searchEntries[0]?.defaultNamingContext;

  if (typeof defaultNamingContext === "string") {
    return defaultNamingContext;
  }

  if (Array.isArray(defaultNamingContext) && defaultNamingContext[0]) {
    return String(defaultNamingContext[0]);
  }

  throw new Error("Não foi possível descobrir o Base DN do Active Directory.");
}

export async function authenticateActiveDirectoryUser(username: string, password: string) {
  const cleanUsername = username.trim();

  if (!cleanUsername || !password) {
    return null;
  }

  const url = requireEnv("AD_LDAP_URL");
  const domainPrefix = requireEnv("AD_DOMAIN_PREFIX").replace(/\\+$/g, "");
  const bindUser = `${domainPrefix}\\${cleanUsername}`;
  const client = new Client({
    url,
    timeout: Number(process.env.AD_LDAP_TIMEOUT_MS ?? 8000),
    connectTimeout: Number(process.env.AD_LDAP_CONNECT_TIMEOUT_MS ?? 5000),
  });

  try {
    await client.bind(bindUser, password);

    const baseDn = await getDefaultNamingContext(client);
    const { searchEntries } = await client.search(baseDn, {
      scope: "sub",
      filter: `(&(objectClass=user)(sAMAccountName=${escapeLdapFilter(cleanUsername)}))`,
      attributes: ["cn", "displayName", "mail", "memberOf", "sAMAccountName"],
      sizeLimit: 1,
    });
    const entry = searchEntries[0];

    if (!entry) {
      return null;
    }

    const groups = normalizeValues(entry.memberOf);
    logGroupDiagnostic(cleanUsername, groups);

    return {
      username: cleanUsername,
      displayName: String(entry.displayName ?? entry.cn ?? cleanUsername),
      email: entry.mail ? String(entry.mail) : undefined,
      groups,
    } satisfies ActiveDirectoryUser;
  } finally {
    await client.unbind().catch(() => undefined);
  }
}

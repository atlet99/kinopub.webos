const MIRROR_HOSTS = ['https://api.srvkp.com', 'https://api.boramoraboom.ru', 'https://api.teleos.club', 'https://api.alador.space'];

const normalizeHost = (host: string) => host.toLowerCase().replace(/\/+$/, '');

export const getMirrorHosts = (primary: string): string[] => {
  const hosts: string[] = [];

  for (const host of [primary, ...MIRROR_HOSTS]) {
    const normalized = normalizeHost(host);

    if (!hosts.some((existing) => normalizeHost(existing) === normalized)) {
      hosts.push(host);
    }
  }

  return hosts;
};

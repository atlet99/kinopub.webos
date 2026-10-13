import isArray from 'lodash/isArray';
import { serialize } from 'object-to-formdata';

import storage from 'storage';

import { getMirrorHosts } from './hosts';

type Primitive = string | number | boolean;

type Param = Primitive | null | undefined | Param[] | { [key: string]: Param };

type Params = Record<string, Param> | null;

function isPrimitive(value: any): value is Primitive {
  return value !== Object(value);
}

export const stringifyParams = (params?: Params) =>
  JSON.stringify(params, (_, value) => {
    if (value === null || value === '') {
      return undefined;
    }

    return value;
  });

export const encodeParam = (param: Param) =>
  encodeURIComponent(isPrimitive(param) ? (param as Primitive) : stringifyParams(param as Record<string, Param>));

export const normalizeArrayParams = (key: string, params: Param[]) =>
  params.map((param, idx) => `${encodeParam(`${key}[${idx}]`)}=${encodeParam(param)}`).join('&');

export const normalizeParams = (params?: Params) =>
  Object.keys(params || {})
    .filter((key) => params?.[key] !== '' && params?.[key] !== null && params?.[key] !== undefined)
    .map((key) => (isArray(params?.[key]) ? normalizeArrayParams(key, params?.[key]! as Param[]) : `${key}=${encodeParam(params?.[key])}`))
    .join('&');

class BaseApiClient {
  private storedHost: string | null = null;
  private storedHostLoaded = false;
  private failCount = 0;
  private hasGoodHost = false;

  protected baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.startsWith('http')
      ? baseUrl
      : window.location.protocol.startsWith('http')
      ? `${window.location.protocol}//${baseUrl}`
      : `http://${baseUrl}`;
  }

  protected async tryRefreshTokens(): Promise<boolean> {
    return false;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    if (typeof AbortController !== 'undefined') {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);

      try {
        return await fetch(url, { ...init, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    }

    // ponytail: no AbortController on old Chromium — leaked connection on timeout is acceptable
    return new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('fetch timeout')), 5000);

      fetch(url, init).then(
        (response) => {
          clearTimeout(timer);
          resolve(response);
        },
        (ex) => {
          clearTimeout(timer);
          reject(ex as Error);
        },
      );
    });
  }

  private async tryFetchResponse(url: string, init: RequestInit): Promise<Response | null> {
    try {
      const response = await this.fetchWithTimeout(url, init);

      if (response.status >= 500) {
        return null;
      }

      if (response.status === 403) {
        // ponytail: clone+json parse as the "is API JSON" 403 heuristic
        try {
          await response.clone().json();
          return response;
        } catch (ex) {
          return null;
        }
      }

      return response;
    } catch (ex) {
      return null;
    }
  }

  private async request<T>(method: 'GET' | 'POST', url: string, params?: Params, data?: Params, retry = false): Promise<T> {
    const isGrantRequest = Boolean(params?.['grant_type']);
    const accessToken = this.getAccessToken();

    if (accessToken && !isGrantRequest && !params?.['access_token']) {
      params = {
        ...params,
        access_token: accessToken,
      };
    }

    const headers: Record<string, string> = accessToken && !isGrantRequest ? { Authorization: `Bearer ${accessToken}` } : {};

    if (!this.storedHostLoaded) {
      this.storedHostLoaded = true;
      this.storedHost = storage.getItem<string>('mirror_last_good_host') || null;
    }

    const hosts = getMirrorHosts(this.baseUrl);
    const originalHost = hosts[0];
    const startIndex = Math.max(0, hosts.indexOf(this.storedHost || originalHost));
    const orderedHosts = hosts.slice(startIndex).concat(hosts.slice(0, startIndex));

    try {
      let response: Response | null = null;

      for (const host of orderedHosts) {
        response = await this.tryFetchResponse(`${host}${url}?${normalizeParams(params)}`, {
          method,
          headers,
          body: data && serialize(data),
        });

        if (response) {
          this.storedHost = host;
          this.hasGoodHost = true;
          this.failCount = 0;
          storage.setItem('mirror_last_good_host', host);
          break;
        }

        this.failCount += 1;

        if (this.failCount >= 3 || !this.hasGoodHost) {
          this.storedHost = hosts[(hosts.indexOf(host) + 1) % hosts.length];
          storage.setItem('mirror_last_good_host', this.storedHost);
          this.failCount = 0;
        }
      }

      if (!response) {
        response = await fetch(`${originalHost}${url}?${normalizeParams(params)}`, {
          method,
          headers,
          body: data && serialize(data),
        });
      }

      if (response.status === 401 && !retry) {
        if (await this.tryRefreshTokens()) {
          if (params) {
            delete params.access_token;
          }

          return this.request<T>(method, url, params, data, true);
        }

        this.clearTokens();

        return {
          error: 'unauthorized',
        } as unknown as T;
      }

      const json = await response.json();

      return json as T;
    } catch (ex) {
      return {
        error: (ex as Error).toString(),
      } as unknown as T;
    }
  }

  protected get<T>(url: string, params?: Params) {
    return this.request<T>('GET', url, params);
  }

  protected post<T>(url: string, data?: Params, params?: Params) {
    return this.request<T>('POST', url, params, data);
  }

  protected getAccessToken(): string {
    throw new Error('not implemented');
  }

  protected getRefreshToken(): string {
    throw new Error('not implemented');
  }

  protected saveTokens({
    access_token,
    refresh_token,
    expires_in,
  }: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }): void | Promise<void> {
    throw new Error('not implemented');
  }

  protected clearTokens(): void | Promise<void> {
    throw new Error('not implemented');
  }
}

export default BaseApiClient;

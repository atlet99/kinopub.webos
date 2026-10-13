import isArray from 'lodash/isArray';
import { serialize } from 'object-to-formdata';

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

  private async request<T>(
    method: 'GET' | 'POST',
    url: string,
    params?: Params,
    data?: Params,
    retry = false,
  ) {
    const isGrantRequest = Boolean(params?.['grant_type']);
    const accessToken = this.getAccessToken();

    if (accessToken && !isGrantRequest && !params?.['access_token']) {
      params = {
        ...params,
        access_token: accessToken,
      };
    }

    const headers: Record<string, string> =
      accessToken && !isGrantRequest ? { Authorization: `Bearer ${accessToken}` } : {};

    try {
      const response = await fetch(`${this.baseUrl}${url}?${normalizeParams(params)}`, {
        method,
        headers,
        body: data && serialize(data),
      });

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

'use strict';

import * as r from 'request';
import fetch, * as f from 'node-fetch';
// tslint:disable-next-line variable-name
const HttpsProxyAgent = require('https-proxy-agent');


interface RequestToFetchOptions {
  (reqOpts: r.OptionsWithUri): [string, f.RequestInit];
}

const requestToFetchOptions: RequestToFetchOptions =
    (reqOpts: r.OptionsWithUri) => {
      const options: f.RequestInit = {
        ...reqOpts.headers && {headers: reqOpts.headers},
        ...reqOpts.method && {method: reqOpts.method},
        ...reqOpts.json && {body: JSON.stringify(reqOpts.body)},
        ...reqOpts.timeout && {timeout: reqOpts.timeout},
        ...reqOpts.gzip && {compress: reqOpts.gzip},

      };

      let uri: string = reqOpts.uri as string;
      if (reqOpts.useQuerystring === true) {
        const qs = require('querystring');
        const params = qs.stringify(reqOpts.qs);
        uri = uri + '?' + params;
      }

      if (reqOpts.proxy || process.env.HTTP_PROXY || process.env.HTTPS_PROXY) {
        const proxy = (process.env.HTTP_PROXY || process.env.HTTPS_PROXY)!;
        options.agent = new HttpsProxyAgent(proxy);
      }

      return [uri, options];
    };

interface FetchToRequestResponse {
  (res: f.Response): r.Response;
}
const fetchToRequestResponse = (res: f.Response) => {
  const response: r.Response = {
    statusCode: res.status,
    statusMessage: res.statusText,
  } as r.Response;
  return response;
};


interface Callback {
  (err: Error|null, response?: r.Response, body?: {}|string): void;
}

// Mimics `request`. Can be used as `request(options, callback)`
// or `request.defaults(opts)(options, callback)`
interface TeenyRequest {
  (reqOpts: r.OptionsWithUri, callback: Callback): void;
  defaults:
      ((options: r.OptionsWithUri) =>
           ((reqOpts: r.OptionsWithUri, callback: Callback) => void));
}

const teenyRequest =
    ((reqOpts: r.OptionsWithUri, callback: Callback) => {
      const [uri, options] = requestToFetchOptions(reqOpts);
      fetch(uri as string, options as f.RequestInit)
          .then((res: f.Response) => {
            if (!res.ok) {
              callback(new Error(`${res.status}: ${res.statusText}`));
              return;
            }
            const header = res.headers.get('content-type');
            if (header === 'application/json' ||
                header === 'application/json; charset=utf-8') {
              const response = fetchToRequestResponse(res);
              res.json()
                  .then(json => {
                    response.body = json;
                    callback(null, response, json);
                  })
                  .catch((err: Error) => {
                    callback(err);
                  });
              return;
            }

            res.text()
                .then(text => {
                  const response = fetchToRequestResponse(res);
                  response.body = text;
                  callback(null, response, text);
                })
                .catch(err => {
                  callback(err);
                });
          })
          .catch((err: Error) => {
            callback(err);
          });
    }) as TeenyRequest;

teenyRequest.defaults = (defaults: r.OptionsWithUri) => {
  return (reqOpts: r.OptionsWithUri,
          callback:
              (err: Error|null, response?: r.Response, body?: {}|string) =>
                  void) => {
    teenyRequest({...defaults, ...reqOpts}, callback);
  };
};

export {teenyRequest};

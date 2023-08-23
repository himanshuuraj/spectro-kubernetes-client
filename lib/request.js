var errors = require('./errors')
    , path = require('path')
    , url = require('url')
    , https = require('https')
    , util = require('util');

const axios = require('axios');

require('sugar');

module.exports = function (info) {
    var protocol = info.protocol || 'https'
        , host = info.host
        , version = info.version
        , token = info.token
        , timeout = info.timeout
        , reqOptions = info.reqOptions
        , namespace = info.namespace;

    var getUrl = function (object) {
        var prefix = 'api', namespaced = false;

        // Allow options to override default  API prefix.
        if (object.options && object.options.apiPrefix) {
            prefix = object.options.apiPrefix;
        }

        //Add option to override namespaces in the URI
        if (object.options && object.options.namespaced) {
            namespaced = true;
        }

        // v1beta3 and greater uses lowercase endpoints instead of
        //  camelCase and defines namespaces in the query URL.
        if ((version === 'v1beta3' || version === 'v1' || version === 'extensions/v1beta1')) {
            namespaced = true;
        }

        // Define base URL for the query.
        var query = protocol + '://' + path.join(host, prefix, version);

        // Fix query URL handling for proxy and watch endpoints.
        if (object.endpoint.match(/^proxy/)) {
            query = query + '/proxy';
            var endpoint = object.endpoint.replace('proxy/', '');
        } else if (object.endpoint.match(/^watch/)) {
            query = query + '/watch';
            var endpoint = object.endpoint.replace('watch/', '');
        } else {
            var endpoint = object.endpoint;
        }

        if (namespaced) {
            endpoint = endpoint.toLowerCase();
            // Never use URL namespacing for namespace or node endpoints.
            if (namespace && !endpoint.match(/^namespaces/) && !endpoint.match(/^nodes/)) {
                return query + '/' + path.join('namespaces', namespace, endpoint);
            }
        }
        return query + '/' + endpoint;
    };

    var isSuccess = function (code) {
        return (code - (code % 200)) === 200;
    };

    var makeRequest = function (object, callback) {
        var object = Object.clone(object);
        object.url = getUrl(object);
        delete object.endpoint;
        if (!object.json) {
            object.json = true;
        }
        object.timeout = timeout;
        if (object.json) {
            if (['object', 'boolean'].none(typeof object.json)) {
                object.body = object.json;
                object.json = undefined;
            }
        }
        // Define paging options.
        if (object.page) {
            if (!object.qs) {
                object.qs = {};
            }
            object.qs.page = object.page;
            delete object.page;
        }
        if (!info.ca) {
            object.strictSSL = false;
            object.rejectUnauthorized = false;
        }
        if (info.cert) {
            object.cert = info.cert;
        }
        if (info.key) {
            object.key = info.key;
        }
        if (info.ca) {
            object.ca = info.ca;
        }

        const httpsAgent = new https.Agent({
            rejectUnauthorized: object.rejectUnauthorized,
            cert: object.cert,
            key: object.key,
            ca: object.key,
        });

        axiosInstance = axios.create({
            httpsAgent: httpsAgent,
            headers: {
                Authorization: `Bearer ${object.headers?.Authorization}`,
            },
        });

        var httpOptions = {
            url: object.url,
            method: object.method,
            timeout: object.timeout || 3000,
            headers: object.headers,
            proxy: object.proxy || '',
            httpsAgent
        };
        if(object.body) {
            httpOptions.data = JSON.stringify(object.body)
        }
        return axios(httpOptions).then(response => {
            console.log("SUCCESS");
            if (isSuccess(response.status)) {
                callback(null, response.data);
            } else {
                callback(errors.get(response));
            }
        })
            .catch(err => {
                console.log("Error", err.toString());
                callback(err);
            });
    };

    return function (object, callback) {
        // Set request authorization token if it is defined.
        if (token) {
            object.auth = {bearer: token};
            if (!object.headers) {
                object.headers = {};
            }
            object.headers = {Authorization: `Bearer ${token}`}
        }

        if (reqOptions) {
            Object.assign(object, reqOptions);
        }

        if (!object.headers) {
            object.headers = {};
            object.headers['Content-Type'] = 'application/json';
        }

        if (object.method === 'PATCH') {
            if (!object.headers) {
                object.headers = {};
            }
            object.headers['Content-Type'] = 'application/strategic-merge-patch+json';
        }
        // Use namespace querystring for older versions of kubernetes.
        if (namespace && version.match(/v1beta(1|2)/)) {
            if (!object.qs) {
                object.qs = {};
            }
            object.qs.namespace = namespace;
        }
        return makeRequest(object, callback);
    };
};

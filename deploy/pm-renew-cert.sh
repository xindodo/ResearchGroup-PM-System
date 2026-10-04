#!/bin/sh
set -eu
cert=/www/server/panel/vhost/letsencrypt/pm.jtgc.cc/fullchain.pem
if openssl x509 -in "$cert" -noout -checkend 2592000; then exit 0; fi
/www/server/panel/pyenv/bin/python /www/server/panel/class/acme_v2.py --domain pm.jtgc.cc --type http --path /www/wwwroot/jtgc.cc/pm
openssl x509 -in "$cert" -noout -checkhost pm.jtgc.cc
openssl x509 -in "$cert" -noout -checkend 2592000
/www/server/nginx/sbin/nginx -t
/www/server/nginx/sbin/nginx -s reload

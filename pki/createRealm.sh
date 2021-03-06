#!/bin/bash

err() {
	echo $1
	exit
}

[ $# -eq 0 ] && err "Usage: createRealm [name]"

# Prepare some vars
[ ! -e config.sh ] && err "The config is missing! Please create \"config.sh\""
. $(pwd)/config.sh
[ -z $COUNTRY ] && err "Variable COUNTRY is not set in config.sh"
[ -z $STATE ] && err "Variable STATE is not set in config.sh"
[ -z $LOCALITY ] && err "Variable LOCALITY is not set in config.sh"
REALM=$1

[ -e $REALM.key -o -e $REALM.key ] && err "Realm is already existing"

openssl req -new -newkey rsa:4096 -x509 -keyout $REALM.key -out $REALM.crt -days 3650 -subj "/C=$COUNTRY/ST=$STATE/L=$LOCALITY/O=$REALM/OU=God/CN=$REALM"

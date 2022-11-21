#!/usr/bin/env bash
#
# Generate a set of TLS credentials that can be used to run development mode.
#
# Based on script by Ash Wilson (@smashwilson)
# https://github.com/cloudpipe/cloudpipe/pull/45/files#diff-15
#
# usage: sh ./genkeys.sh NAME HOSTNAME IP

set -o errexit

USAGE="usage: sh ./genkeys.sh NAME HOSTNAME IP"
ROOT="$(pwd)"

PASSOPT="file:${ROOT}/.generate/dev.password"
PASSOPTIN="file:${ROOT}/.generate/dev.passwordin"

CAFILE="${ROOT}/.ssh/openpgp.online.cert.crt"
CAKEY="${ROOT}/.ssh/openpgp.online.key"

# Randomly create a password file, if you haven't supplied one already.
# For development mode, we'll just use the same (random) password for everything.
#if [ ! -f "${PASSFILE}" ]; then
#  echo ">> creating a random password in ${PASSFILE}."
#  touch ${PASSFILE}
#  chmod 600 ${PASSFILE}
  # "If the same pathname argument is supplied to -passin and -passout arguments then the first
  # line will be used for the input password and the next line for the output password."
#  cat /dev/random | head -c 128 | base64 | sed -n '{p;p;}' >> ${PASSFILE}
#  echo "<< random password created"
#fi

# Generate the certificate authority that we'll use as the root for all the things.
#if [ ! -f "${CAFILE}" ]; then
#  echo ">> generating a certificate authority"
#  openssl genrsa -des3 \
#    -passout ${PASSOPT} \
#    -out ${CAKEY} 2048
#  openssl req -new -x509 -days 365 \
#    -batch \
#    -passin ${PASSOPT} \
#    -key ${CAKEY} \
#    -passout ${PASSOPT} \
#    -out ${CAFILE}
#  echo "<< certificate authority generated."
#fi

# Generate a named keypair
keypair() {
  local NAME=$1
  local HOSTNAME=$2
  local IP=$3

  local SERIALOPT=""

  if [ ! -f "${ROOT}/.generate/ca.srl" ]; then
    echo ">> creating serial"
    SERIALOPT="-CAcreateserial"
  else
    SERIALOPT="-CAserial ${ROOT}/.generate/ca.srl"
  fi

  echo ">> generating a keypair for: ${NAME}"

  echo ".. key"

  #openssl ecparam -genkey -name secp384r1 -out ${ROOT}/${NAME}-key.pem

  openssl genrsa -des3 \
  	-passout ${PASSOPTIN} \
    -out ${ROOT}/.generate/${NAME}-key.pem 2048

  cp ${ROOT}/.generate/openssl.conf ${ROOT}/.generate/openssl-${NAME}.cnf
  echo "DNS.2 = ${HOSTNAME}
IP.1 = ${IP}" >> ${ROOT}/.generate/openssl-${NAME}.cnf

  echo ".. request"
  openssl req -subj "/CN=${HOSTNAME}" -new \
    -batch \
	-passin ${PASSOPTIN} \
    -key ${ROOT}/.generate/${NAME}-key.pem \
    -passout ${PASSOPT} \
    -out ${ROOT}/.generate/${NAME}-req.csr \
    -config ${ROOT}/.generate/openssl-${NAME}.cnf

  echo ".. certificate"
  openssl x509 -req -days 365 \
	-passin ${PASSOPT} \
    -in ${ROOT}/.generate/${NAME}-req.csr \
    -CA ${CAFILE} \
    -CAkey ${CAKEY} \
    ${SERIALOPT} \
    -extensions v3_req \
    -extfile ${ROOT}/.generate/openssl-${NAME}.cnf \
    -out ${ROOT}/.generate/${NAME}-cert.pem \

  echo ".. removing key password"
  openssl rsa \
    -passin ${PASSOPTIN} \
    -in ${ROOT}/.generate/${NAME}-key.pem \
    -out ${ROOT}/.generate/${NAME}-key.pem

  echo "<< ${NAME} keypair generated."
}

# call with arguments name, hostname, and ip address
if [ -z "$1" ]; then
  echo "${USAGE}"
  exit 1
fi
if [ -z "$2" ]; then
  echo "${USAGE}"
  exit 1
fi
if [ -z "$3" ]; then
  echo "${USAGE}"
  exit 1
fi

keypair "$1" "$2" "$3"
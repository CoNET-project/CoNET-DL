import type { RequestOptions } from 'node:http'

import { stat, mkdir, writeFile, readFile, link } from 'node:fs'
import { homedir, networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { get } from 'node:http'
import { request as requestHttps } from 'node:https'
import { inspect } from 'node:util'
import { unzip } from 'node:zlib'
import { exec } from 'node:child_process'

import { createInterface } from 'readline'
import { publicKeyByPrivateKey, cipher, decryptWithPrivateKey, hex, recover, hash, recoverPublicKey } from 'eth-crypto'
import { Buffer } from 'buffer'
import { readCleartextMessage, verify, readKey } from 'openpgp'
import { Writable } from 'node:stream'
import Web3 from 'web3'
import { Endpoint } from 'aws-sdk'
import S3 from 'aws-sdk/clients/s3'
import colors from 'colors/safe'
import { series, waterfall } from 'async'
import Accounts from 'web3-eth-accounts'

const Eth = require('web3-eth')

const wasabiObj = {
	us_east_1: {
		endpoint: 's3.wasabisys.com',
		Bucket: 'conet-mvp',
		Bucket_key: 'router'
	}
}

export const logger = (...argv: any ) => {
    const date = new Date ()
    let dateStrang = `[${ date.getHours() }:${ date.getMinutes() }:${ date.getSeconds() }:${ date.getMilliseconds ()}]`
    return console.log ( colors.yellow(dateStrang), ...argv )
}

const DL_Path = '.CoNET-DL'
const setupFileDir = join ( homedir(), DL_Path )

// const requestUrl = (option: any, postData: string) => {

// 	return new Promise((resolve: any) => {
// 		const req = requestHttps (option, res => {
// 			clearTimeout (timeout)
// 			logger (colors.blue(`Connect to DL Server [${option.path}]`))
// 			if (res.statusCode !== 200 ) {
// 				logger (colors.red(`DL Server response !200 code [${ res.statusCode }]`))
// 				return resolve (null)
// 			}
// 			let ret = ''
// 			res.setEncoding('utf8')

// 			res.on('data', chunk => {
// 				ret += chunk
// 			})

// 			res.once ('end', () => {
// 				let retJson = null
// 				try {
// 					retJson = JSON.parse (ret)
// 				} catch (ex) {
// 					logger (colors.red(`DL Server response no JSON error! [${ ret }]`))
// 					return resolve (null)
// 				}
// 				return resolve (retJson)
// 			})
// 		})

// 		req.on ('error', err => {
// 			resolve (null)
// 			return logger (`register_to_DL postToServer [${ option.uri }] error`, err )
// 		})

// 		if ( postData ) {
// 			req.write(postData)
// 		}



// 		const timeout = setTimeout (() => {
// 			logger (Colors.red(`requestUrl on TIMEOUT Error!`))
// 			return resolve (null)
// 		}, conetDLServerTimeout)
		
// 		return req.end()
// 	})
	
// }

export const rfc1918 = /(^0\.)|(^10\.)|(^100\.6[4-9]\.)|(^100\.[7-9]\d\.)|(^100\.1[0-1]\d\.)|(^100\.12[0-7]\.)|(^127\.)|(^169\.254\.)|(^172\.1[6-9]\.)|(^172\.2[0-9]\.)|(^172\.3[0-1]\.)|(^192\.0\.0\.)|(^192\.0\.2\.)|(^192\.88\.99\.)|(^192\.168\.)|(^198\.1[8-9]\.)|(^198\.51\.100\.)|(^203.0\.113\.)|(^22[4-9]\.)|(^23[0-9]\.)|(^24[0-9]\.)|(^25[0-5]\.)/

const otherRespon = ( body: string| Buffer, _status: number ) => {
	const Ranges = ( _status === 200 ) ? 'Accept-Ranges: bytes\r\n' : ''
	const Content = ( _status === 200 ) ? `Content-Type: text/html; charset=utf-8\r\n` : 'Content-Type: text/html\r\n'
	const headers = `Server: nginx/1.6.2\r\n`
					+ `Date: ${ new Date ().toUTCString()}\r\n`
					+ Content
					+ `Content-Length: ${ body.length }\r\n`
					+ `Connection: keep-alive\r\n`
					+ `Vary: Accept-Encoding\r\n`
					//+ `Transfer-Encoding: chunked\r\n`
					+ '\r\n'

	const status = _status === 200 ? 'HTTP/1.1 200 OK\r\n' : 'HTTP/1.1 404 Not Found\r\n'
	return status + headers + body
}
const wei = 1000000000000000000

export const sendCoNETAsset = (walletAddr: string, admin_private: string, token: number ) => {
	return new Promise(async resolve => {
		const eth = new Eth ( new Eth.providers.HttpProvider(fujiCONET))
		const obj = {
			gas: 21000,
			to: walletAddr,
			value: (token * wei).toString()
		}
		let createTransaction

		try {
			createTransaction = await eth.accounts.signTransaction( obj, admin_private )
		} catch (ex) {
			logger (colors.red(`sendCoNETAsset ERROR`), ex)
			return resolve (null)
		}
		return createTransaction
		
	})
}

export const return404 = () => {
	const kkk = '<html>\r\n<head><title>404 Not Found</title></head>\r\n<body bgcolor="white">\r\n<center><h1>404 Not Found</h1></center>\r\n<hr><center>nginx/1.6.2</center>\r\n</body>\r\n</html>\r\n'
	return otherRespon ( Buffer.from ( kkk ), 404 )
}

export const jsonResponse = ( body: string ) => {
	const headers = `Server: nginx/1.6.2\r\n`
		+ `Date: ${ new Date ().toUTCString()}\r\n`
		+ `Content-Type: application/json; charset=utf-8\r\n`
		+ `Content-Length: ${ body.length }\r\n`
		+ `Connection: keep-alive\r\n`
		+ `Vary: Accept-Encoding\r\n`
		//+ `Transfer-Encoding: chunked\r\n`
		+ '\r\n'
	const status = 'HTTP/1.1 200 OK\r\n'
	return status + headers + body
}

export const returnHome = () => {
	const kkk = 
`<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title>
<style>
    body {
        width: 35em;
        margin: 0 auto;
        font-family: Tahoma, Verdana, Arial, sans-serif;
    }
</style>
</head>
<body>
<h1>Welcome to nginx!</h1>
<p>If you see this page, the nginx web server is successfully installed and
working. Further configuration is required.</p>

<p>For online documentation and support please refer to
<a href="http://nginx.org/">nginx.org</a>.<br/>
Commercial support is available at
<a href="http://nginx.com/">nginx.com</a>.</p>

<p><em>Thank you for using nginx.</em></p>
</body>
</html>
`
	return otherRespon ( kkk, 200 )
}

export const getSetup: ( debug: boolean ) => Promise<ICoNET_NodeSetup|null> = ( debug: boolean ) => {
	
	const setupFile = join ( setupFileDir, 'nodeSetup.json')
	let nodeSetup: ICoNET_NodeSetup

	return new Promise( resolve => {
		return stat( setupFileDir, err => {
			if ( err ) {
				logger (`checkSetupFile: have no .CoNET-DL. Create new directory`)
				return mkdir ( setupFileDir, err => {
					return resolve (null)
				})
			}
			try {
				nodeSetup = require (setupFile)
			} catch (ex) {
				logger (colors.red(`checkSetupFile: .CoNET-DL setup file damaged!`))
				return resolve (null)
			}
			nodeSetup.setupPath = setupFileDir
			return resolve ( nodeSetup )
		})
	})
}

export const getServerIPV4Address = ( includeLocal: boolean ) => {
	const nets = networkInterfaces()
	const results = []
	for ( const name of Object.keys( nets )) {
		// @ts-ignore: Unreachable code error
		for (const net of nets[ name ]) {
			if ( net.family === 'IPv4' && !net.internal ) {
				// if (!results[ name ]) {
				// 	results[ name ] = []
				// }
				if (!includeLocal ) {
					if ( rfc1918.test (net.address)) {
						logger (`${net.address} is local`)
						continue
					}
				}
				results.push( net.address )
			}
		}
		}
		
	
	return results
}

export const generateWalletAddress = ( password: string ) => {
	// @ts-ignore: Unreachable code error
	const accountw: Accounts.Accounts = new Accounts()
	const acc = accountw.wallet.create(2)
	return acc.encrypt ( password )
}

export const loadWalletAddress = ( walletBase: any, password: any ) => {
	// @ts-ignore: Unreachable code error
	const account: Accounts.Accounts = new Accounts()
	const uu = account.wallet.decrypt ( walletBase, password )

	// @ts-ignore: Unreachable code error
	uu[0]['publickey'] = publicKeyByPrivateKey (uu[0].privateKey)
	// @ts-ignore: Unreachable code error
	uu[1]['publickey'] = publicKeyByPrivateKey (uu[1].privateKey)
	return uu
}

export const saveSetup = ( path: string, setup: string ) => {

	return new Promise( resolve => {
		return writeFile (path, setup, 'utf-8', err => {
			if ( err ) {
				throw err
			}
			return resolve (null)
		})
	})
}

export const waitKeyInput: (query: string, password: boolean ) => Promise<string> = (query: string, password = false ) => {

	return new Promise( resolve =>  {
		const mutableStdout = new Writable({
			write: ( chunk, encoding, next ) => {
				// @ts-ignore: Unreachable code error
				if (!mutableStdout["muted"]) {
					process.stdout.write (chunk, encoding)
				}
				return next()
			}
		})
		
		const rl = createInterface ({
			input: process.stdin,
			output: mutableStdout,
			terminal: true
		})
		rl.question ( colors.green(query), ans => {
			rl.close()
			return resolve(ans)
		})

		// @ts-ignore: Unreachable code error
		return mutableStdout["muted"] = password
	})
	
}

const unZipText  = ( compressedText: string ) => {
	const compressBuff = Buffer.from (compressedText,'base64')
	return {
		then (resolve: any, reject: any) {
			return unzip(compressBuff, (err, data) => {
				if ( err ) {
					return reject (err)
				}
				return resolve (data.toString())
			})
		}
	}
}

export const decryptPayload = ( message: string, signature: string ) => {
	const retObj: ICoNET_DecryptedPayload = {
		payload: null,
		senderAddress: '',
		publickey: ''
	}

	try {
		const hashM = hash.keccak256(message)
		retObj.publickey = recoverPublicKey (signature, hashM)
		retObj.payload = JSON.parse(message)
		retObj.senderAddress = recover ( signature, hashM).toUpperCase()
	} catch (ex) {
		return null
	}
	return retObj
}

const getPublicKeyArmoredKeyID = async (publicKeyArmored: string) => {
	const keyObj = await readKey ({armoredKey: publicKeyArmored})
	return keyObj.getKeyIDs()[1].toHex().toUpperCase()
}

export const checkPublickeySign  = async ( cleartextMessage: string ) => {
	const signedMessage = await readCleartextMessage({
        cleartextMessage // parse armored message
    })

	const pubkeyObj = await readKey ({ armoredKey: signedMessage.getText() })

	const verificationResult = await verify ({
		// @ts-ignore: Unreachable code error
        message: signedMessage,
        verificationKeys: pubkeyObj
    })

	const { verified, keyID } = verificationResult.signatures[0]

	try {
        await verified // throws on invalid signature
    } catch (ex) {
		logger (colors.red (`checkPublickeySign Error`), ex)
		logger (`cleartextMessage\n`, cleartextMessage)
        return (null)
    }
	const ret: ICoNET_GPG_PublickeySignResult = {
		armoredPublicKey: signedMessage.getText(),
		publicKeyID: await getPublicKeyArmoredKeyID(signedMessage.getText())
	}
	return (ret)
}

export const generateSslCertificatesV1 = async (ipAddr: string, wallet_Addr: string ) => {
	const out = '-subj "/C=US/ST=Kharkov/L=Kharkov/O=Super Secure Company/OU=IT Department/CN=example.com"'
}


export const postRouterToPublic = ( data: ICoNET_DecryptedPayload, publicKeyObj: ICoNET_GPG_PublickeySignResult, s3pass: s3pass ) => {
	return new Promise (resolve => {
		
		const payload = data.payload

		const saveObj: ICoNET_Router = {
			gpgPublicKeyID: publicKeyObj.publicKeyID,
			profileImg: '',
			nickName: '',
			armoredPublicKey: publicKeyObj.armoredPublicKey,
			walletAddr: data.senderAddress,
			ipv4: payload.ipV4,
			walletPublicArmored: data.publickey,
			emailAddr: ''
		}
		const saveObj_json_string = JSON.stringify(saveObj)
		const routerPath = join (setupFileDir, 'router')
		
		const wallet_addr_file_name =join( routerPath, data.senderAddress)
		const pgp_file_name = publicKeyObj.publicKeyID
		
		return series ([
			next => stat ( routerPath, err => {
				if ( err ) {
					return mkdir ( routerPath, next )
				}
				next ()
			}),
			next => writeFile (wallet_addr_file_name, saveObj_json_string, 'utf8', next ),
			next => link (wallet_addr_file_name, pgp_file_name, next )
		], async err => {
			if ( err ) {
				logger (colors.red(`saveRouter async.series ERROR`), err )
			}
			
			const wo = wasabiObj.us_east_1

			const up1: S3.PutObjectRequest = {
				Bucket: wo.Bucket,
				Key: `${ wo.Bucket_key }/${ wallet_addr_file_name }`,
				Body: saveObj_json_string,
			}
			const up2: S3.PutObjectRequest = {
				Bucket: wo.Bucket,
				Key: `${  wo.Bucket_key }/${ pgp_file_name }`,
				Body: saveObj_json_string,
			}

			const opt = {
				//credentials: credentials,
				credentials: {
					accessKeyId: s3pass.ACCESS_KEY,
					secretAccessKey: s3pass.SECRET_KEY
				},
				endpoint: new Endpoint(wo.endpoint),
				correctClockSkew: true
			}

			const s3 = new S3(opt)

			//		******************
			//			Fix S3 bug
			//		******************
				const check1 = opt.credentials.accessKeyId
				const check2 = opt.credentials.secretAccessKey
				if (/\n$/.test(check1)) {
					opt.credentials.accessKeyId = check1.replace (/\n/, '')
				}
				if ( /\n$/.test(check2)) {
					opt.credentials.secretAccessKey = check2.replace (/\n/, '')
				}

			//		******************

			await s3.putObject (up1).promise()
			await s3.putObject (up2).promise()

			logger(colors.blue(`S3 [${ up2.Key } & ${ up1.Key }] upload SUCCESS!`))
			return resolve (true)
		})
	})
}

export const getIpaddressLocaltion = (Addr: string) => {
	return new Promise((resolve) => {
		const url = `http://ip-api.com/json/${Addr}`
		return get (url, res => {
			if ( res.statusCode !== 200 ) {
				const error = `getIpaddressLocaltion URL = [${url}] res.statusCode !== 200 [${ res.statusCode }]`
				logger (colors.red(error))
				return resolve (null)
			}
			let body = ''

			res.on ('data', data => {
				return body += data
			})
			return res.once ('end', () => {
				let ret: ICoNET_IP_API_Result
				try {
					ret = JSON.parse (body)
				} catch (ex) {
					const error = `getIpaddressLocaltion [${url}] response a no JSON data!`
					logger (colors.red(error))
					return resolve (null)
				}
				ret.location = `${ ret.region },${ ret.countryCode }`
				return resolve (ret)
			})
		})
	})
	
}

const usdcNet = 'https://mvpusdc.conettech.ca/mvpusdc'
const CONETNet = 'https://conettech.ca/mvp'
const fujiCONET = `https://conettech.ca/fujiCoNET`
const testNet = ''

const denominator = 1000000000000000000

export const getCONETBalance = async (Addr: string) => {
	const eth = new Eth ( new Eth.providers.HttpProvider(fujiCONET))
	let uuu
	try {
		uuu = await eth.getBalance(Addr)
	} catch (ex) {
		logger (`getCONETBalance NETWORK [${fujiCONET}] ERROR!`)
		return null
	}
	
	console.log (uuu)
	const balance = parseInt(uuu)/denominator
	console.log (`Balance=`, balance)
	return balance
}

// const tokenContract = '0x'
// export const getCoNET_USDC_Balance = async (Addr: string ) => {
// 	const balanceOfABI = [
// 		{
// 			"constant": true,
// 			"inputs": [
// 				{
// 					"name": "_owner",
// 					"type": "address"
// 				}
// 			],
// 			"name": "balanceOf",
// 			"outputs": [
// 				{
// 					"name": "balance",
// 					"type": "uint256"
// 				}
// 			],
// 			"payable": false,
// 			"stateMutability": "view",
// 			"type": "function"
// 		},
// 	]
// 	const eth = new Eth ( new Eth.providers.HttpProvider(testNet))
// 	const ethContract = new eth.Contract(balanceOfABI, tokenContract)
// 	const result = parseInt(await ethContract.methods.balanceOf (Addr).call())/denominator

// 	return result
// }

export const getUSDCBalance = async (Addr: string) => {
	const eth = new Eth ( new Eth.providers.HttpProvider(usdcNet))
	const uuu = await eth.getBalance(Addr)

	const balance = parseInt(uuu)/denominator
	console.log (`Balance=`, balance)
	return balance
}

export const checkAddress = (walletAddr: string) => {
	return Web3.utils.isAddress (walletAddr)
}

export const getConfirmations = async (txHash: string, receiveAddr: string, network: string ) => {
	const eth = new Eth ( new Eth.providers.HttpProvider(network))
	const trx = await eth.getTransaction(txHash)
	if ( !trx ) {
		return null
	}
	logger (inspect(trx, false, 3, true))
	const _receiveAddr: string = trx.to
	if ( _receiveAddr.toUpperCase() !== receiveAddr.toUpperCase()) {
		return null
	}
	const from = trx.from
	const ret = parseFloat((trx.value/denominator).toString())
	
	return {
		value: ret,
		from
	}
}

export const s3fsPasswd: () => Promise<s3pass|null> = () => {
	return new Promise (resolve => {
		const s3fsPasswdFile = join(homedir(), '.passwd-s3fs')
		return readFile (s3fsPasswdFile, 'utf-8', (err, data ) => {
			if ( err || !data ) {
				logger (colors.red(`s3fsPasswd have no [.passwd-s3fs] setup file!`))
				return resolve (null)
			}
			const pass = data.split(':')
			if ( pass.length < 2 ) {
				logger (colors.red(`[.passwd-s3fs] have not correct!`))
				return resolve (null)
			}
			const ret: s3pass = {
				ACCESS_KEY: pass[0],
				SECRET_KEY: pass[1]
			}
			return resolve (ret)
		})
		
	})
}

const conetServerTimeout = 1000 * 60
const requestUrl = (option: RequestOptions, postData: string) => {

	return new Promise((resolve: any) => {

		const req = requestHttps ( option, res => {
			clearTimeout (timeout)
			logger (colors.blue(`Connect to [${ option.hostname }] Server [${option.path}]`))

			if (res.statusCode !== 200 ) {
				logger (colors.red(`Server [${ option.hostname }] response !200 code [${ res.statusCode }]`))
				return resolve (null)
			}
			let ret = ''
			res.setEncoding('utf8')

			res.on('data', chunk => {
				ret += chunk
			})

			res.once ('end', () => {
				let retJson = null
				try {
					retJson = JSON.parse (ret)
				} catch (ex) {
					logger (colors.red(`[${ option.hostname }] Server response no JSON error! [${ ret }]`))
					return resolve (null)
				}
				return resolve ( retJson )
			})
		})

		const timeout = setTimeout (() => {
			logger (colors.red(`requestUrl on TIMEOUT Error!`))
			return resolve (null)
		}, conetServerTimeout)

		req.on ('error', err => {
			resolve (null)
			return logger (` postToServer [${ option.hostname }] error`, err )
		})

		if ( postData ) {
			req.write(postData)
		}
		
		return req.end()
	})
	
}

export const regiestCloudFlare = (ipAddr: string, gpgKeyID: string, setup: ICoNET_DL_masterSetup) => {
	return new Promise (async resolve => {
		const option: RequestOptions = {
			hostname: 'api.cloudflare.com',
			path: `${ setup.cloudflare.path }`,
			port: 443,
			method: 'POST',
			headers: {
				'X-Auth-Email': setup.cloudflare.X_Auth_Email,
				'X-Auth-Key': setup.cloudflare.X_Auth_Key,
				'Content-Type': 'application/json'
			}
		}
		const postData = {
			type: 'A',
			name: `${ gpgKeyID }.${setup.cloudflare.domainname}`,
			content: `${ ipAddr }`,
			proxied: true,
			ttl: 1
		}
		logger (inspect(postData, false, 3, true ))
		logger (inspect(option, false, 3, true ))
		const res = await requestUrl (option, JSON.stringify (postData))
		if (!res) {
			logger ( colors.red(`regiestCloudFlare [${ postData.name }] ERROR!`))
			return resolve (null)
		}
		logger ( colors.red(`regiestCloudFlare ERROR!`))
		return resolve (true)
	})
}


export const startPackageSelfVersionCheckAndUpgrade = async (packageName: string ) => {
	

	const execCommand = (command: string ) => {

		return new Promise ( resolve => {
			let u = ''
			let stderr: Error|null = null

			logger (colors.magenta(`execCommand doing [${ command }]`))
			const running = exec ( command )

			if ( running.stdout ) {
				running.stdout.on ('data', data => {
					u += data.toString()
				})
			}

			if (running.stderr) {
				running.stderr.once ('error', err => {
					stderr = err
				})
			}

			running.once ('exit', () => {
				if ( stderr ) {
					return resolve (null)
				}
				if ( u.length ) {
					logger (colors.blue(`execCommand stdout\n`), u)
					return resolve (true)
				}
				return resolve (false)
			})
		})
	}

	const cmd1 = await execCommand (`npm outdated -g | grep ${packageName}`)
	if ( cmd1 === null ) {
		logger (colors.red(`execCommand npm outdated -g | grep ${packageName} had ERROR!`))
		return (null)
	}
	if ( cmd1 === false ) {
		logger (colors.blue(`startPackageSelfVersionCheckAndUpgrade ${packageName} has up to date!`))
		return (false)
	}
	logger (`startPackageSelfVersionCheckAndUpgrade doing upgrade now!`)
	const cmd2 = await execCommand  (`sudo npm cache clean --force && sudo npm i ${packageName} -g`)
	if ( cmd2 === null ) {
		logger (colors.red(`execCommand [sudo npm cache clean --force && sudo npm i ${packageName} -g] had ERROR!`))
		return (null)
	}
	logger (colors.blue(`startPackageSelfVersionCheckAndUpgrade ${packageName} have new version and upgrade success!`))
	return (true)
}
/**
 * 
 * 		TEST 
 * 
 */

const oo = '-----BEGIN PGP PUBLIC KEY BLOCK-----\n\nxjMEY38xzRYJKwYBBAHaRw8BAQdAQ7BcuZQ62x1YFuIsFRdyQNEzIARXBAlB\niKnbNROP7EzNKjB4OGNFRDQyZDE0OERDNkQ0NDUyMjhEZWNCMjdiQTRDNUEy\nNzdmM2Q3Q8KMBBAWCgA+BQJjfzHNBAsJBwgJEFfB8+NqSYKBAxUICgQWAAIB\nAhkBAhsDAh4BFiEEYrtPimIWMq9ntE6WV8Hz42pJgoEAAMr4AQCi6jBLc5nb\nO2PFVlXh62wQh/PfnczeIHzIM2mlDJp8jgEA3DFoZoDl7OBWbIgn/sCwy1NJ\n0rFBXWJGKgveBKmaWArOOARjfzHNEgorBgEEAZdVAQUBAQdAEhdiJ0iljXb3\n3dBPfwvw91Vw6fG0T3FmQlyqhuV2wm8DAQgHwngEGBYIACoFAmN/Mc0JEFfB\n8+NqSYKBAhsMFiEEYrtPimIWMq9ntE6WV8Hz42pJgoEAAO9XAQDLfA5+rYWV\nL67b1Vkh+t5mK4fVqJWdHc746RlLn21m/wEA9ivM3SoL6anqZOcD8nWR5lQu\n3I2hHRjViXayGw4drAQ=\n=ZK+G\n-----END PGP PUBLIC KEY BLOCK-----\n'

const kk = "-----BEGIN PGP MESSAGE-----\n\n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\n=E7tc\n-----END PGP MESSAGE-----\n"
const test = async () => {
	const uuu =  await getPublicKeyArmoredKeyID(oo)
	
	logger (inspect(uuu, false, 3, true))
}

test()

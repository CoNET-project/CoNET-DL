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

const decryptPayload_old = async ( compressedText: string, initNode: ICoNET_NodeSetup|any ) => {

	const ret = async ( resolve: any ) => {
		const retObj: ICoNET_DecryptedPayload = {
			payload: null,
			senderAddress: '',
			publickey: ''
		}
		try {
			// @ts-ignore: Unreachable code error
			const encryptedText = await unZipText(compressedText)
			const decryptObj = await decryptWithPrivateKey ( initNode.keyObj[0].privateKey, cipher.parse ( encryptedText ))
			const decryptedPayload = JSON.parse( decryptObj )
			const senderAddress = recover( decryptedPayload.signature, hash.keccak256( decryptedPayload.message ))
			const payload = JSON.parse (decryptedPayload.message)
			const publicKey = Buffer.from(recoverPublicKey (decryptedPayload.signature, hash.keccak256(decryptedPayload.message)),'hex').toString('base64')
			
			retObj.payload = payload
			retObj.senderAddress = senderAddress
			retObj.publickey = publicKey
			logger (inspect(retObj, false, 3, true))
		} catch (ex) {
			throw ex
		}
		return resolve (retObj)
	}
	return new Promise<ICoNET_DecryptedPayload> (resolve => {
		return ret ( resolve )
	})
}

export const checkPublickeySign  = async ( cleartextMessage: string ) => {
	const signedMessage = await readCleartextMessage({
        cleartextMessage // parse armored message
    })

	const pubkeyObj = await readKey ({ armoredKey: signedMessage.getText() })

	const verificationResult = await verify({
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
		publicKeyID: keyID.toHex().toUpperCase()
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
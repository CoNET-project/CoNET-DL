import colors from 'colors/safe'
import { series } from 'async'
import { stat, mkdir, writeFile } from 'node:fs'
import { homedir, networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { get } from 'node:http'
import { inspect } from 'node:util'
import Accounts from 'web3-eth-accounts'
import { unzip } from 'node:zlib'
import { createInterface } from 'readline'
import { publicKeyByPrivateKey, cipher, decryptWithPrivateKey, hex, recover, hash, recoverPublicKey } from 'eth-crypto'
import { Buffer } from 'buffer'
import { ulid } from 'ulid'
import { Writable } from 'node:stream'
import Web3 from 'web3'

const Eth = require('web3-eth')

export const logger = (...argv: any ) => {
    const date = new Date ()
    let dateStrang = `[${ date.getHours() }:${ date.getMinutes() }:${ date.getSeconds() }:${ date.getMilliseconds ()}]`
    return console.log ( colors.yellow(dateStrang), ...argv )
}

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

export const getSetup = ( debug: boolean ) => {
	const homeDir = homedir ()
	const setupFileDir = join ( homeDir, '.CoNET-DL' )
	const setupFile = join ( setupFileDir, 'nodeSetup.json')
	debug ? logger ( `setupFile = ${ setupFile }` ): null
	let nodeSetup: ICoNET_NodeSetup

	return {
		then( resolve: any ) {
			return stat( setupFileDir, err => {
				if ( err ) {
					logger (`checkSetupFile: have no .CoNET-DL directory`)
					return mkdir ( setupFileDir, err => {
						return resolve ()
					})
				}
				try {
					nodeSetup = require (setupFile)
				} catch (ex) {
					return resolve ()
				}
				nodeSetup.setupPath = setupFileDir
				return resolve ( nodeSetup )
			})
		}
	}
	
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

export const GenerateWalletAddress = ( password: string ) => {
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

export const saveSetup = ( setup: ICoNET_NodeSetup, debug: boolean ) => {
	const homeDir = homedir ()
	const setupFileDir = join ( homeDir, '.CoNET-DL' )
	const setupFile = join ( setupFileDir, 'nodeSetup.json')
	debug ? logger ( `setupFile = ${ setupFile }` ): null
	return {
		then ( resolve: any ) {
			return writeFile (setupFile, JSON.stringify (setup), 'utf-8', err => {
				if ( err ) {
					throw err
				}
				return resolve ()
			})
		}
	}
}

export const waitKeyInput = (query: string, password = false ) => {

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

	return {
		then( resolve: any ) {
			rl.question ( colors.green(query), ans => {
				rl.close()
				return resolve(ans)
			})
			// @ts-ignore: Unreachable code error
			return mutableStdout["muted"] = password
		}
	}
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

export const decryptPayload = async ( compressedText: string, initNode: ICoNET_NodeSetup|any ) => {

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


export const getIpaddressLocaltion = (Addr: string) => {
	return new Promise((resolve) => {
		return get (`http://ip-api.com/json/${Addr}`, res => {
			if ( res.statusCode !== 200 ) {
				throw new Error (`getIpaddressLocaltion res.statusCode !== 200 [${ res.statusCode }]`)
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
					throw ex
				}
				ret.location = `${ ret.region },${ ret.countryCode }`
				return resolve (ret)
			})
		})
	})
	
}

const usdcNet = 'http://mvpusdc.conettech.ca/mvpusdc'
const CONETNet = 'https://conettech.ca/mvp'
const fujiCONET = `https://conettech.ca/fujiCoNET`
const testNet = ''

const denominator = 1000000000000000000

export const getCONETBalance = async (Addr: string) => {
	const eth = new Eth ( new Eth.providers.HttpProvider(fujiCONET))
	const uuu = await eth.getBalance(Addr)
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
	console.log (uuu)
	const balance = parseInt(uuu)/denominator
	console.log (`Balance=`, balance)
	return balance
}

export const checkAddress = (walletAddr: string) => {
	return Web3.utils.isAddress (walletAddr)
}

export const getConfirmations = async (txHash: string, receiveAddr: string) => {
	const eth = new Eth ( new Eth.providers.HttpProvider(fujiCONET))
	const trx = await eth.getTransaction(txHash)
	const _receiveAddr: string = trx.to

	if ( _receiveAddr.toUpperCase() !== receiveAddr.toUpperCase()) {
		return null
	}
	const from = trx.from
	const ret = parseFloat((trx.value/denominator).toString())
	logger (inspect(trx, false, 3, true))
	return {
		value: ret,
		from
	}
}

/**
 * 
 * 		TEST 
 * 
 */
/*
const sampleAddress = `0xc45543B3Ad238696a417b94483D313794541c4dF`
const kkk = checkAddress (sampleAddress)
logger (kkk)


/*
	getSetupFile (true, (err, data) => {
		if (err ) {
			return logger (err)
		}
		return logger ('success!')
	})

 /** */

/*
const uuu = getConfirmations ('0x095e9da197a4582c1f08e7a062f416ebe8623e333262dd85d558ff2282fc8390', '0xD493391c2a2AafEd135A9f6164C0Dcfa9C68F1ee')
logger (`getConfirmations success!`,uuu)

/*
	logger ( inspect(getServerIPV4Address (false), false, 3, true ))

 /** */
/*
	const uu =  GenerateWalletAddress ('')
	logger (inspect (uu, false, 3, true ))
	const kk = loadWalletAddress ( uu,'' )

/** */

/*
	const y = ulid()
	const uu = Base32.decode (y, 'Crockford')
	const ss = Buffer.from (uu)
	logger (colors.grey( hexdump(ss)))
/** */
/*

const test = '0xD493391c2a2AafEd135A9f6164C0Dcfa9C68F1ee'
const yyyy = getCONETBalance (test)
console.log ( inspect(yyyy, false, 3, true))
/** */

/*
const test = '0x87a60f1E90Ad57350C48391e5809Be8C9Ad17137'
getCoNET_USDC_Balance (test)
/** */
/*

getIpaddressLocaltion('74.208.37.68').then (data=> {
	logger (`getIpaddressLocaltion`)
	logger(inspect (data, false, 3, true))
})

/** */
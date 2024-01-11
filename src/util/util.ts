import type { RequestOptions } from 'node:http'

import { stat, mkdir, writeFile, readFile, link } from 'node:fs'
import { homedir, networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { get } from 'node:http'
import {reverse} from 'node:dns'
import { request as requestHttps } from 'node:https'
import Cluster from 'node:cluster'
import { inspect } from 'node:util'
import { exec } from 'node:child_process'
import { createInterface } from 'readline'
import { publicKeyByPrivateKey, cipher, decryptWithPrivateKey, hex, recover, hash, recoverPublicKey, util } from 'eth-crypto'
import { Buffer } from 'buffer'
import { readCleartextMessage, verify, readKey, readMessage, readPrivateKey, decryptKey, decrypt, generateKey } from 'openpgp'
import type { GenerateKeyOptions, Key, PrivateKey, Message, MaybeStream, Data, DecryptMessageResult, WebStream, NodeStream } from 'openpgp'
import { Writable } from 'node:stream'
import colors from 'colors/safe'
import {ethers} from 'ethers'
import JSBI from 'jsbi'
import {abi as CONET_Point_ABI} from './conet-point.json'
import {abi as CONET_Referral_ABI} from './conet-referral.json'
import {abi as CONET_multiTransfer_ABI} from './CONET_multiTransfer.json'
import {series, eachSeries, eachOfSeries, eachOfLimit, eachLimit} from 'async'
import Web3, { Web3Eth } from 'web3'


const CONET_Holesky_write = 'https://a3c6a17769809e43.conet.network'
const CONET_Holesky_read= 'https://ee62a6be24b3c4581defb76b7d.conet.network'

let provide_write = new ethers.JsonRpcProvider(CONET_Holesky_write)
let provideReader = new ethers.JsonRpcProvider(CONET_Holesky_read)

const conet_point_contract = `0x0f43685B2cB08b9FB8Ca1D981fF078C22Fec84c5`
const conet_Referral_contract = `0x8f6be4704a3735024F4D2CBC5BAC3722c0C8a0BD`
const CNTP_HoleskyMultiTransfer = '0x94217083059e7D1eFdd9D9f95039A43329D532ac'
//const CNTP_HoleskyMultiTransfer = '0x8f6be4704a3735024F4D2CBC5BAC3722c0C8a0BD'

const workerNumber = Cluster?.worker?.id ? colors.grey(`worker : ${Cluster.worker.id} `) : `${ Cluster?.isPrimary ? colors.grey('Cluster Master'): colors.bgCyan('Cluster unknow')}`

export const logger = (...argv: any ) => {
    const date = new Date ()
    let dateStrang = `${ workerNumber } [${ date.getHours() }:${ date.getMinutes() }:${ date.getSeconds() }:${ date.getMilliseconds ()}]`
    return console.log ( colors.yellow(dateStrang), ...argv )
}

const DL_Path = '.CoNET-DL'
const setupFileDir = join ( homedir(), DL_Path )

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
	logger(colors.blue(`Start up check setupFile [${setupFile}]`))
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
		const _next = nets[ name ]
		if (_next) {
			for (const net of _next) {
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
		
	}
		
	
	return results
}


export const loadWalletAddress = ( walletBase: any) => {
	logger (`loadWalletAddress`)
	logger (inspect(walletBase, false, 3, true))
}

export const generatePgpKeyInit = async (walletAddr: string) => {

	const option = {
        type: 'ecc',
		userIDs: [{
			name: walletAddr
		}],
		curve: 'curve25519',
        format: 'armored',
	}


	const { privateKey, publicKey } = await generateKey (
		//@ts-ignore
		option)

	const keyObj = await readKey ({armoredKey: publicKey})
	const keyID = keyObj.getKeyIDs()[1].toHex().toUpperCase ()
	const ret: pgpKey = {
		privateKeyArmored: privateKey,
		publicKeyArmored: publicKey,
		keyID
	}
	
	return ( ret )
}

export const makePgpKeyObj = async ( keyObj: pgpKey) => {

	try {
		keyObj.privateKeyObj = await readPrivateKey ({armoredKey: keyObj.privateKeyArmored})
	} catch (ex) {
		logger (colors.red(`makePgpKeyObj error!   ====> `), inspect(keyObj, false, 3, true))
	}

	
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
				//@ts-ignore
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

		//@ts-ignore
		return mutableStdout["muted"] = password
	})
	
}

export const decryptPayload = ( obj: ICoNET_Profile ) => {

	let walletAddr = ''
	try {
		const messageHash = hash.keccak256(obj.walletAddr)
		walletAddr = recover (obj.walletAddrSign, messageHash).toUpperCase()
		
	} catch (ex) {
		logger (colors.red(`decryptPayload hash.keccak256 or recover have EX! `), inspect(obj, false, 3, true))
		return null
	}
	if ((obj.walletAddr = obj.walletAddr.toUpperCase()) !== walletAddr ) {
		logger (colors.red(`decryptPayload obj walletAddr [${obj.walletAddr}]  signed walletAddr [${ walletAddr }] have not match!`))
		return null
	}
	return obj
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

// export const postRouterToPublic = ( nodeData: ICoNET_DL_POST_register_SI|null, profileData: ICoNET_Profile|null, s3pass: s3pass ) => {
// 	return new Promise (async resolve => {
		
// 		const saveObj = nodeData ? <ICoNET_SINode> {
// 			gpgPublicKeyID1: nodeData.gpgPublicKeyID1,
// 			gpgPublicKeyID0: nodeData.gpgPublicKeyID0,
// 			armoredPublicKey: nodeData.armoredPublicKey,
// 			walletAddr: nodeData.walletAddr,
// 			ipv4: nodeData.ipV4,
// 			nft_tokenid: nodeData.nft_tokenid
// 		} : profileData ? <ICoNET_Profile> {
// 			gpgPublicKeyID0: profileData.gpgPublicKeyID0,
// 			gpgPublicKeyID1: profileData.gpgPublicKeyID1,
// 			armoredPublicKey: profileData.armoredPublicKey,
// 			walletAddr: profileData.walletAddr,
// 			nickName: profileData.nickName,
// 			profileImg: profileData.profileImg,
// 			routerArmoredPublicKey: profileData.routerArmoredPublicKey,
// 			routerPublicKeyID: profileData.routerPublicKeyID,
// 			emailAddr: profileData.emailAddr,
// 			bio: profileData.bio

// 		} : null

// 		if ( !saveObj) {
// 			return resolve (false)
// 		}

// 		logger (inspect(saveObj, false, 3, true))

// 		const saveObj_json_string = JSON.stringify(saveObj)
		
		
// 		const wo = wasabiObj.us_east_1

// 		const up1: S3.PutObjectRequest = {
// 			Bucket: wo.Bucket,
// 			Key: `${ wo.Bucket_key }/${ saveObj.walletAddr }`,
// 			Body: saveObj_json_string,
// 		}

// 		const up2: S3.PutObjectRequest = {
// 			Bucket: wo.Bucket,
// 			Key: `${  wo.Bucket_key }/${ saveObj.gpgPublicKeyID1 }`,
// 			Body: saveObj_json_string,
// 		}
// 		const up4: S3.PutObjectRequest = {
// 			Bucket: wo.Bucket,
// 			Key: `${  wo.Bucket_key }/${ saveObj.gpgPublicKeyID0 }`,
// 			Body: saveObj_json_string,
// 		}
// 		let up3 : S3.PutObjectRequest| null = null
// 		if (nodeData) {
// 			up3 =  {
// 				Bucket: wo.Bucket,
// 				Key: `${ wo.Bucket_key }/${ nodeData.nft_tokenid }`,
// 				Body: saveObj_json_string,
// 			}
// 		}
		

// 		const opt = {
// 			//credentials: credentials,
// 			credentials: {
// 				accessKeyId: s3pass.ACCESS_KEY,
// 				secretAccessKey: s3pass.SECRET_KEY
// 			},
// 			endpoint: new Endpoint(wo.endpoint),
// 			correctClockSkew: true
// 		}

// 		const s3 = new S3(opt)

// 		//		******************
// 		//			Fix S3 bug
// 		//		******************
// 			const check1 = opt.credentials.accessKeyId
// 			const check2 = opt.credentials.secretAccessKey
// 			if (/\n$/.test(check1)) {
// 				opt.credentials.accessKeyId = check1.replace (/\n/, '')
// 			}
// 			if ( /\n$/.test(check2)) {
// 				opt.credentials.secretAccessKey = check2.replace (/\n/, '')
// 			}

// 		//		******************

// 		await s3.putObject (up1).promise()
// 		await s3.putObject (up2).promise()
// 		await s3.putObject (up4).promise()
// 		up3 ? await s3.putObject (up3).promise() : null

// 		logger( colors.grey(`[${ up2.Key } & ${ up1.Key } & ${ up3 ? up3.Key : ''}] `), colors.blue(`upload SUCCESS!`))
// 		return resolve (true)
// 	})
// }

export const getIpaddressLocaltion = (Addr: string) => {
	return new Promise((resolve) => {
		const url = `http://ip-api.com/json/${Addr}`

		const tryGetInfo = () => {
			return get (url, res => {
				if ( res.statusCode !== 200 ) {
					const error = `getIpaddressLocaltion URL = [${url}] res.statusCode !== 200 [${ res.statusCode }] try again late!`
					logger (colors.grey(error))
					setTimeout(() => {
						return tryGetInfo ()
					}, 500)
					
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
		}
		tryGetInfo ()
	})
	
}

export const nodesWalletAddr = [
	'0x8b02ec615B7a2d5B82F746F990062459DF996c48',
	'0x7Bc3FEA6Fc415CD1c36cf5CCA31786Cb3823A4b2',
	'0x3b2Ae491CEADaA454c99Bd3f64377e1EB66B9F38',

	'0x24D074530bB9526a67369b67FCf1Fa6cf6ef6845', 
	'0xd1A18F6aa5bC2b4928C313F1bDbE9f5799f1A2db',
	'0x6eaE0202053c5aEf1b57911fec208f08D96050DE',

	'0x295bA944D9a7e7b2c5EfC0e96b7a063c685F7c7d',
	'0xd0D7006c30549fE2932b543815Fde2FB45a3AAEB',
	'0x060FC4A81a51393C3077B024b99f2DE63F020DdE',

	'0x335Cf03756EF2B667a1F892F4382ce03b919265b',
	'0x019Ed74EF161AD1789bd2c61E39511A7E41b76c1',
	'0x04441E4BC3A8842473Fe974DB4351f0b126940be',

	'0xf2e12cc4C09858AF1330b85E2c8A5aaD7b39Bf3C',
	'0x4fa1FC4a2a96D77E8521628268631F735E2CcBee',
	'0x12F3f8ac3966fed21Ec764E17d5d5D3fB1A4CBfD',

	'0x4a287A601Cf17A817fd764348cB0190cac68fbD1',
	'0x74eDC24c5559A5f39506aa09A406F250808694Ec',
	'0xE30B823Aeb7d199D980b7480EC5667108DC583DD',

	'0xBA34Ac9dabF6eF33Dd1A666675bDD52264274A7c',
	'0x2BD9D9EB221bd4e60b301C0D25Aa7c7829e76De3',
	'0x6F226df857fFA0d1f8C3C0533db06e7E6042CCc7',

	'0x3A67775d2634BDC09336a7d2836016eA211B4F32',
	'0x518b2eb8dffe6e826C737484c9f2Ead6696C7A44',
	'0x318a3927EBDE5e06b0f9c7F1012C84e69916f5Fc',

	'0x522d89e0C5c8d53D9656eA0f33efa20a81bd76c6',
	'0xDBaa41dd7CABE1D5Ca41d38E8F768f94D531d85A',
	'0xc9043f661ADddCAF902d45D220e7aea38920d188',

	'0x1Afc1Fcb4eC4931F1EA8B38026b93a7A8482A813',
	'0xDf6bA415F39CFd294F931eb54067cDC872B1d2B5',
	'0x9F550F2E95df1Fd989da56f3cB706E3E839F7b5e',

	'0xEdd67DdD7870609461A606A2502ad6e8959e44E3',
	'0xB8f7bDfFee7C74B8d6619eB374d42AD5f89C626a',
	'0xC1E6ccf826322354ae935e15e750DFF6a6Ad1BfC'

]


export const listedServerIpAddress: _nodeType[] = [
	{ipaddress: '74.208.25.159', type: 'super', wallet_addr: '0x8b02ec615B7a2d5B82F746F990062459DF996c48'},
	{ipaddress: '74.208.151.98', type: 'super', wallet_addr: '0x7Bc3FEA6Fc415CD1c36cf5CCA31786Cb3823A4b2'},
	{ipaddress: '108.175.5.112', type: 'super', wallet_addr: '0x3b2Ae491CEADaA454c99Bd3f64377e1EB66B9F38'},
	{ipaddress: '18.141.57.27', type: 'super', wallet_addr: '0x24D074530bB9526a67369b67FCf1Fa6cf6ef6845'},
	{ipaddress: '18.183.80.90', type: 'super', wallet_addr: '0xd1A18F6aa5bC2b4928C313F1bDbE9f5799f1A2db'},
	{ipaddress: '13.239.38.224', type: 'super', wallet_addr: '0x6eaE0202053c5aEf1b57911fec208f08D96050DE'},
	{ipaddress: '15.222.60.58', type: 'super', wallet_addr: '0x295bA944D9a7e7b2c5EfC0e96b7a063c685F7c7d'},
	{ipaddress: '54.180.201.53', type: 'super', wallet_addr: '0xd0D7006c30549fE2932b543815Fde2FB45a3AAEB'},
	{ipaddress: '13.201.10.126', type: 'super', wallet_addr: '0x060FC4A81a51393C3077B024b99f2DE63F020DdE'},
	{ipaddress: '3.249.42.39', type: 'super', wallet_addr: '0x335Cf03756EF2B667a1F892F4382ce03b919265b'},
	{ipaddress: '13.49.78.96', type: 'super', wallet_addr: '0x019Ed74EF161AD1789bd2c61E39511A7E41b76c1'},
	{ipaddress: '3.39.6.186', type: 'super', wallet_addr: '0x04441E4BC3A8842473Fe974DB4351f0b126940be'},
	{ipaddress: '18.141.138.103', type: 'super', wallet_addr: '0xf2e12cc4C09858AF1330b85E2c8A5aaD7b39Bf3C'},
	{ipaddress: '18.183.233.233', type: 'super', wallet_addr: '0x4fa1FC4a2a96D77E8521628268631F735E2CcBee'},
	{ipaddress: '54.253.148.59', type: 'super', wallet_addr: '0x12F3f8ac3966fed21Ec764E17d5d5D3fB1A4CBfD'},
	{ipaddress: '3.97.14.120', type: 'super', wallet_addr: '0x4a287A601Cf17A817fd764348cB0190cac68fbD1'},
	{ipaddress: '3.249.114.59', type: 'super', wallet_addr: '0x74eDC24c5559A5f39506aa09A406F250808694Ec'},
	{ipaddress: '16.171.111.74', type: 'seed', wallet_addr: '0xE30B823Aeb7d199D980b7480EC5667108DC583DD'},
	{ipaddress: '34.220.25.63', type: 'seed', wallet_addr: '0xBA34Ac9dabF6eF33Dd1A666675bDD52264274A7c'},
	{ipaddress: '13.126.187.210', type: 'seed', wallet_addr: '0x2BD9D9EB221bd4e60b301C0D25Aa7c7829e76De3'},
	{ipaddress: '52.32.48.56', type: 'seed', wallet_addr: '0x6F226df857fFA0d1f8C3C0533db06e7E6042CCc7'},
	{ipaddress: '3.135.219.44', type: 'seed', wallet_addr: '0x3A67775d2634BDC09336a7d2836016eA211B4F32'},
	{ipaddress: '18.118.30.178', type: 'seed', wallet_addr: '0x518b2eb8dffe6e826C737484c9f2Ead6696C7A44'},
	{ipaddress: '3.94.10.79', type: 'seed', wallet_addr: '0x318a3927EBDE5e06b0f9c7F1012C84e69916f5Fc'},
	{ipaddress: '3.92.198.43', type: 'seed', wallet_addr: '0x522d89e0C5c8d53D9656eA0f33efa20a81bd76c6'},
	{ipaddress: '35.160.232.140', type: 'seed', wallet_addr: '0xDBaa41dd7CABE1D5Ca41d38E8F768f94D531d85A'},
	{ipaddress: '34.220.98.227', type: 'seed', wallet_addr: '0xc9043f661ADddCAF902d45D220e7aea38920d188'},
	{ipaddress: '3.96.195.24', type: 'seed', wallet_addr: '0x1Afc1Fcb4eC4931F1EA8B38026b93a7A8482A813'},
	{ipaddress: '13.40.127.155', type: 'super', wallet_addr:'0x9F550F2E95df1Fd989da56f3cB706E3E839F7b5e'},
	{ipaddress: '3.96.128.140', type: 'super', wallet_addr: '0xDf6bA415F39CFd294F931eb54067cDC872B1d2B5'},
	{ipaddress: '35.178.196.130', type: 'super', wallet_addr: '0xEdd67DdD7870609461A606A2502ad6e8959e44E3'},
	{ipaddress: '13.36.175.68', type: 'super', wallet_addr: '0xB8f7bDfFee7C74B8d6619eB374d42AD5f89C626a'},
	{ipaddress: '13.36.170.7', type: 'super', wallet_addr: '0xC1E6ccf826322354ae935e15e750DFF6a6Ad1BfC'},

	{ipaddress: '3.70.95.181', type: 'super', wallet_addr: '0xD130bB620f41838c05C65325b6ee84be1D4B4701'},
	{ipaddress: '3.123.129.184', type: 'seed', wallet_addr: '0xAF34d323683d8bA040Dac24cc537243AeC319A30'},
	{ipaddress: '35.176.186.10', type: 'seed', wallet_addr: '0x368B873f37bc15e1bE12EeA0BDE1f0bbb9192bB8'},

	{ipaddress: '3.8.212.216', type: 'seed', wallet_addr: '0x93AC5b9b1305616Cb5B46a03546356780FF6c0C7'},
	{ipaddress: '35.180.232.50', type: 'seed', wallet_addr: '0xb1C01c53fcDA4E968CE21Af8055392779239eF1b'},
]


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

		const res = await requestUrl (option, JSON.stringify (postData))

		if (!res) {
			logger ( colors.red(`regiest CloudFlare [${ postData.name }] [${ipAddr}] ERROR!`))
			return resolve (null)
		}
		logger ( colors.blue(`${ gpgKeyID }.${setup.cloudflare.domainname} `), colors.grey(` => ${ipAddr} CloudFlare success!`))
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

export const decryptPgpMessage = async ( pgpMessage: string, pgpPrivateObj: PrivateKey ) => {

	let message
	let clearObj: DecryptMessageResult
	try {
		message = await readMessage ({armoredMessage: pgpMessage})
		clearObj = await decrypt ({ message, decryptionKeys: pgpPrivateObj })
	} catch (ex) {
		logger (colors.red(`decryptPgpMessage readMessage pgpMessage | decrypt message Error!`), colors.gray(pgpMessage),
		`message?.getEncryptionKeyIDs = `+message?.getEncryptionKeyIDs().map(n => n.toHex().toUpperCase()), 
		`pgpPrivateObj.getKeyID() = `+ pgpPrivateObj.getKeyID().toHex().toUpperCase(),  ex )
		return null
	}
	
	if (typeof clearObj.data !== 'string' ) {
		logger (colors.red(`decryptPgpMessage clearObj.data !== 'string' Error!`))
		return null
	}

	if (! clearObj.signatures.length ) {
		logger (colors.red(`decryptPgpMessage have no signatures Error! clearObj.signatures = [${ clearObj.signatures }]`))
		return null
	}
	
	let obj: ICoNET_Router_Base

	try {
		obj = JSON.parse(Buffer.from(clearObj.data, 'base64').toString())
	} catch (ex) {
		logger (colors.red(`decryptPgpMessage JSON.parse clear Obj Error!`),inspect(clearObj, false, 3, true))
		return null
	}

	if (!obj.armoredPublicKey) {
		logger (colors.red(`decryptPgpMessage decrypted OBJ have no armoredPublicKey Error!`), inspect(obj, false, 3, true))
		return null
	}

	obj.signPgpKeyID = clearObj.signatures[0].keyID.toHex().toUpperCase()

	let publickeyObj: Key
	
	try {
		publickeyObj = await readKey ({armoredKey: obj.armoredPublicKey})
	} catch (ex) {
		logger (colors.red(`decryptPgpMessage readKey armoredPublicKey Error!`), inspect(obj, false, 3, true))
		return null
	}
	 
	obj.gpgPublicKeyID1 = publickeyObj.getKeyIDs()[1].toHex().toUpperCase()
	obj.gpgPublicKeyID0 = publickeyObj.getKeyIDs()[0].toHex().toUpperCase()

	const signkeyID = publickeyObj.getKeyIDs()[0].toHex().toUpperCase()
	
	if (obj.signPgpKeyID !== signkeyID) {
		logger (colors.red(`decryptPgpMessage obj.signKeyID[${ obj.signPgpKeyID }] !== armoredPublicKey.signkeyID [${ signkeyID }] Error!`))
		return null
	}
	
	return obj
}

export const sendCONET: (privateKey: string, amountInEther: string, receiverAddress: string) => Promise<ethers.TransactionResponse|null> = (privateKey: string, amountInEther: string, receiverAddress: string) => {

	const wallet = new ethers.Wallet(privateKey, provide_write)
	
	return new Promise (resolve => {
		let address
		try {
			address = ethers.getAddress(receiverAddress.toLowerCase())
		} catch (ex) {
			logger (colors.red(`sendCONET ethers.getAddress(${receiverAddress}) ERROR!`))
			return resolve (null)
		}
		const tx = {
			to: address,
			// Convert currency unit from ether to wei
			value: ethers.parseEther(amountInEther)
		}

		wallet.sendTransaction(tx)
		.then((txObj) => {
			return resolve(txObj)
		})
		.catch (ex => {
			logger (colors.red(`sendCONET Catch Error` ), ex)
			return resolve (null)
		})
	})
	
}

const countDecimals = (x: number) => {
	if (Math.floor(x) === x) {
	  return 0
	}
	return x.toString().split('.')[1].length || 0
}

const fromReadableAmount: (amount: number, decimals: number) => JSBI = (amount, decimals) => {
	const extraDigits = Math.pow (10, countDecimals(amount))
	const adjustedAmount = parseInt((amount * extraDigits).toString())
	const k1 = JSBI.BigInt(adjustedAmount)
	const k2 = JSBI.exponentiate(JSBI.BigInt(10), JSBI.BigInt(decimals))
	const k3 = JSBI.BigInt(extraDigits)
	const k4 = JSBI.divide(JSBI.multiply(k1, k2),k3)
	return k4
}

export const getCONETConfirmations = async (txHash: string, receiveAddr: string) => {

	let tx: ethers.TransactionResponse|null
	try {
		tx = await provideReader.getTransaction(txHash)
	} catch (ex) {
		return null
	}
	if (!tx || !tx.to) {
		return null
	}
	if (tx.to.toUpperCase() !== receiveAddr.toUpperCase() ) {
		return null
	}

	return {
		value: ethers.formatEther(tx.value),
		from: tx.from
	}



	// const eth = new Eth ( new Eth.providers.HttpProvider(network))
	// const trx = await eth.getTransaction(txHash)
	// if ( !trx ) {
	// 	return null
	// }
	// logger (inspect(trx, false, 3, true))
	// const _receiveAddr: string = trx.to
	// if ( _receiveAddr.toUpperCase() !== receiveAddr.toUpperCase()) {
	// 	return null
	// }
	// const from = trx.from
	// const ret = parseFloat((trx.value/denominator).toString())
	
	// return {
	// 	value: ret,
	// 	from
	// }
}

export const checkSignObj = (message: string, signMess: string) => {
	if (!message || !signMess) {
		return null
	}
	let obj: minerObj
	try {
		obj = JSON.parse(message)
	} catch (ex) {
		logger (colors.red(`checkSignObj JSON.parse(message) Error`), message)
		return null
	}
	let digest, recoverPublicKey
	try {
		digest = ethers.id(message)
		recoverPublicKey = ethers.recoverAddress(digest, signMess)
	} catch (ex) {
		logger (colors.red(`checkSignObj recoverPublicKey ERROR`), ex)
		logger (`digest = ${digest} signMess = ${signMess}`)
		return null
	}
	
	if (!recoverPublicKey || !obj?.walletAddress || recoverPublicKey.toUpperCase() !== obj?.walletAddress?.toUpperCase()) {
		logger (colors.red(`checkSignObj obj Error!`))
		return null
	}
	return obj
	
}

export const _nodes = [
	'0x8b02ec615B7a2d5B82F746F990062459DF996c48',
	'0x7Bc3FEA6Fc415CD1c36cf5CCA31786Cb3823A4b2',
	'0x3b2Ae491CEADaA454c99Bd3f64377e1EB66B9F38',
	'0x24D074530bB9526a67369b67FCf1Fa6cf6ef6845', 
	'0xd1A18F6aa5bC2b4928C313F1bDbE9f5799f1A2db',
	'0x6eaE0202053c5aEf1b57911fec208f08D96050DE',
	'0x295bA944D9a7e7b2c5EfC0e96b7a063c685F7c7d',
	'0xd0D7006c30549fE2932b543815Fde2FB45a3AAEB',
	'0x060FC4A81a51393C3077B024b99f2DE63F020DdE',
	'0x335Cf03756EF2B667a1F892F4382ce03b919265b',
	'0x019Ed74EF161AD1789bd2c61E39511A7E41b76c1',
	'0x04441E4BC3A8842473Fe974DB4351f0b126940be',
	'0xf2e12cc4C09858AF1330b85E2c8A5aaD7b39Bf3C',
	'0x4fa1FC4a2a96D77E8521628268631F735E2CcBee',
	'0x12F3f8ac3966fed21Ec764E17d5d5D3fB1A4CBfD',
	'0x4a287A601Cf17A817fd764348cB0190cac68fbD1',
	'0x74eDC24c5559A5f39506aa09A406F250808694Ec',
	'0xDf6bA415F39CFd294F931eb54067cDC872B1d2B5',
	'0x9F550F2E95df1Fd989da56f3cB706E3E839F7b5e',
	'0xEdd67DdD7870609461A606A2502ad6e8959e44E3',
	'0xB8f7bDfFee7C74B8d6619eB374d42AD5f89C626a',
	'0xC1E6ccf826322354ae935e15e750DFF6a6Ad1BfC',
	'0xD130bB620f41838c05C65325b6ee84be1D4B4701'
]

export const _nodes1= [
	'0xE30B823Aeb7d199D980b7480EC5667108DC583DD',
	'0x2BD9D9EB221bd4e60b301C0D25Aa7c7829e76De3',
	'0xBA34Ac9dabF6eF33Dd1A666675bDD52264274A7c',
	'0x6F226df857fFA0d1f8C3C0533db06e7E6042CCc7',
	'0x3A67775d2634BDC09336a7d2836016eA211B4F32',
	'0x518b2eb8dffe6e826C737484c9f2Ead6696C7A44',
	'0x318a3927EBDE5e06b0f9c7F1012C84e69916f5Fc',
	'0x522d89e0C5c8d53D9656eA0f33efa20a81bd76c6',
	'0xDBaa41dd7CABE1D5Ca41d38E8F768f94D531d85A',
	'0xc9043f661ADddCAF902d45D220e7aea38920d188',
	'0x1Afc1Fcb4eC4931F1EA8B38026b93a7A8482A813',
	'0xAF34d323683d8bA040Dac24cc537243AeC319A30',
	'0x368B873f37bc15e1bE12EeA0BDE1f0bbb9192bB8',
	'0xb1C01c53fcDA4E968CE21Af8055392779239eF1b',
	'0x93AC5b9b1305616Cb5B46a03546356780FF6c0C7'

]

export const splitPei = async (walletAddressList: string[], privateKeyReferrals: string, ReferralsMap: Map<string, string>,callback: (data: any)=> void) => {


	const total_pie = 77.160493827160494*2
	//const total_pie = 0.007716*2

	const nodes1_Pei = total_pie * .603
	const nodes2_Pei = total_pie * .323
	const free_Pei = total_pie - nodes1_Pei - nodes2_Pei

	const pay1 = nodes1_Pei / _nodes.length
	const pay2 = nodes2_Pei / _nodes1.length
	

	const pay = _nodes.map(n => pay1)
	const nodes = _nodes.map(n=>n)
	//			0.1TB tokens / 180 days = 555555.555555555555556 /day
	//			23148.148148148148148 / hour
	//			385.802469135802469 / min
	//			77.160493827160494 / block (5 blocks / min)
	

	const payList = pay.map(n => ethers.parseUnits(n.toFixed(6),'ether').toString())
	
	for (let i = 0; i < _nodes1.length; i ++) {
		nodes.push (_nodes1[i])
		payList.push (ethers.parseUnits(pay2.toFixed(6),'ether').toString())
	}

	const freeAddressList = []
	const freePayList = []
	if (walletAddressList?.length >0) {
		const pay_free = (free_Pei / walletAddressList?.length).toFixed(6)
		for (let i = 0; i < walletAddressList.length; i ++) {
			freeAddressList.push (walletAddressList[i])
			freePayList.push (ethers.parseUnits(pay_free,'ether').toString())
		}
	}

	return ReferralsPay(nodes, payList, freeAddressList, freePayList, privateKeyReferrals, ReferralsMap, callback)

}

export const sendTokenToMiner = async (walletList: string[], payList: string[],  privateKey: string, nonceLock: nonceLock) => {
	if (nonceLock.conetPointAdmin) {
		return setTimeout(() => {sendTokenToMiner (walletList, payList, privateKey, nonceLock)}, 1000)
	}
	nonceLock.conetPointAdmin = true
	const wallet = new ethers.Wallet(privateKey, provide_write)
	const contract = new ethers.Contract(conet_point_contract, CONET_Point_ABI, wallet)
	let uu
	try{
		uu = await contract.multiTransferToken(walletList, payList)
	} catch(ex) {
		provide_write = new ethers.JsonRpcProvider(CONET_Holesky_write)
		nonceLock.conetPointAdmin = false
		return logger (colors.red(`sendTokenToMiner call Error, Try make new provide RPC`), ex)
	}
	nonceLock.conetPointAdmin = false
	let total = 0
	payList.forEach(n => total += parseFloat(n)/10**18)
	return logger (colors.magenta (`Send to Miner success! nodes + free userDATA LENGTH [${ walletList.length }] Total CNTP = [${total}]`))
}

export const checkSign = (message: string, signMess: string, publicAddress: string) => {
	let digest, recoverPublicKey, obj: minerObj
	try {
		obj = JSON.parse(message)
		digest = ethers.id(message)
		recoverPublicKey = ethers.recoverAddress(digest, signMess)
	} catch (ex) {
		logger (colors.red(`checkSignObj recoverPublicKey ERROR`), ex)
		logger (`digest = ${digest} signMess = ${signMess}`)
		return null
	}
	if (recoverPublicKey.toUpperCase() !== publicAddress.toUpperCase()) {
		logger (colors.red(`checkSignObj recoveredAddress.toUpperCase(${recoverPublicKey.toUpperCase()}) !== obj.walletAddress.toUpperCase(${publicAddress.toUpperCase()})`))
		return null
	}
	obj.walletAddress = publicAddress
	return obj
}

export const checkReferralSign: (referee: string, referrer: string, ReferralsMap: Map<string, string>, _privateKey: string, nonceLock: nonceLock)=> Promise<string|boolean> =
	 (_referee, _referrer, ReferralsMap, _privateKey, nonceLock) => new Promise ( async resolve=> {
		
		const wallet = new ethers.Wallet(_privateKey, provideReader)
		const contract = new ethers.Contract(conet_Referral_contract, CONET_Referral_ABI, wallet)
		let referee: string, referrer: string
		try {
			referee = ethers.getAddress(_referee)
			referrer = ethers.getAddress(_referrer)
		} catch (ex) {
			logger (colors.grey(`checkReferralSign ethers.getAddress(${_referee}) || ethers.getAddress(${_referrer}) Error!`))
			provideReader = new ethers.JsonRpcProvider(CONET_Holesky_read)
			return resolve (false)
		}
		
		if (referee === referrer) {
			logger (colors.grey(`referrer[${referrer}] == referee[${referee}]`))
			return resolve (false)
		}

		logger (colors.grey(`referrer[${referrer}] => referee[${referee}]`))
		let uu: string, tt: string[]

		try{
			uu = ReferralsMap.get(referee) || await contract.getReferrer(referee)
			tt = await contract.getReferees(referee)
		} catch(ex) {
			provideReader = new ethers.JsonRpcProvider(CONET_Holesky_read)
			resolve(false)
			return  logger (colors.grey(`checkReferralSign call getReferrals Error, Try make new provide RPC`), ex)
		}
		if (uu !== ethers.getAddress('0x0000000000000000000000000000000000000000')) {
			return resolve(uu)
		}
		ReferralsMap.set(referee, referrer)
		// if ( parseInt(cntpToken.toString()) > 0) {
		// 	logger (colors.red(`referee[${referee}] balance of CNTP > 0`), cntpToken)
		// }

		// if (tt.length > 0) {
		// 	logger (colors.red(`referee has referrer` ), inspect(tt, false, 2, true))
		// 	return resolve(true)
		// }
		const waitPool = async () => {
			if (nonceLock.cnptReferralAdmin) {
				return setTimeout (() => {waitPool()}, 500)
			}
			nonceLock.cnptReferralAdmin = true
			try{
				uu = await contract.addReferrer(referee, referrer)
			} catch (ex) {
				nonceLock.cnptReferralAdmin = false
				return logger (colors.grey(`checkReferralSign call addReferrals Error, Try make new provide RPC`), ex)
			}
			nonceLock.cnptReferralAdmin = false
			return resolve(true)
		}
		waitPool()
		return resolve(true)

})

const ReferralsPay = (nodeList: string[], nodePay: string[], freeList: string[], freePay: string[], privateKey: string, ReferralsMap: Map<string, string>, callback: (data: any)=> void) => {

	const addressList: string[] =[]
	const payList: string[] = []
	eachOfLimit(nodeList, 5, (n, index, next) => {
		CalculateReferrals(n, nodePay[parseInt(index.toString())],[.2, .1, .05], [], privateKey, ReferralsMap, (err, data) => {
			if (err) {
				return logger (colors.red(`CalculateReferrals Error!`), err)
			}
			// logger(colors.magenta(`CalculateReferrals return address [${n}] result!`), colors.gray(`${data.addressList}`), colors.gray(`${data.payList}`))
			addressList.push(...data.addressList)
			payList.push(...data.payList)

			next()
		})
	}, err => {
		eachOfLimit(freeList, 5, (n, index, next) => {
			CalculateReferrals(n, freePay[parseInt(index.toString())],[.05, .03, .01], [], privateKey,ReferralsMap, (err, data1) => {
				if (err) {
					return logger (colors.red(`CalculateReferrals Error!`), err)
				}
				addressList.push(...data1.addressList)
				payList.push(...data1.payList)
				next()
			})
		}, async err => {
			
			const ret: sendMiner = {
				miner:mergeTransfers([...nodeList, ...freeList], [...nodePay, ...freePay]),
				referrals: mergeTransfers(addressList, payList)
			}
			
			return callback(ret)
		})
	})
}

const mergeTransfers = (_nodeList: string[], pay: string[]) => {
	const walletList: string[] = []
	const payList: string[] = []
	const beforeLength = _nodeList.length
	//logger(colors.blue(`mergeTransfers _nodeList length [${_nodeList.length}] pay length [${pay.length}]`))
	const nextItem = () => {
			const item = _nodeList.shift()
			
			//			the end of array
			if (!item) {
				// logger(colors.magenta(`the end of Array`))
				return 
			}
			const payItem = pay.shift()
			if (!payItem) {
				logger(colors.red(`mergeTransfers _nodeList length [${_nodeList.length}] !== pay length [${pay.length}]`))
				return
			}
			walletList.push(item)
			payList.push(payItem.split('.')[0])

			const nextIndexFun = () => {
				const nextIndex = _nodeList.findIndex(nn => nn === item)
				//		no more item
				if (nextIndex<0) {
					return nextItem()

				}
				_nodeList.splice(nextIndex, 1)[0]
				const _pay = pay.splice(nextIndex, 1)[0]
				const currentIndex = payList.length - 1
				const oldPay = parseFloat(payList[currentIndex])
				const newPay = parseFloat(_pay)
				payList[currentIndex] = (oldPay + newPay).toFixed(0)
				nextIndexFun()
			}
			nextIndexFun()
		
	}
	nextItem()
	logger(colors.blue(`mergeTransfers length from [${beforeLength}] to [${payList.length}]`))
	return {walletList, payList}
}

export const multiTransfer = async (privateKey: string, nodes: string[], _payList: string[], nonceLock: nonceLock) => {
	if (nonceLock.cnptReferralAdmin) {
		return setTimeout(() => {multiTransfer(privateKey, nodes, _payList, nonceLock)}, 1000)
	}
	nonceLock.cnptReferralAdmin = true
	const wallet = new ethers.Wallet(privateKey, provide_write)
	const contract = new ethers.Contract(CNTP_HoleskyMultiTransfer, CONET_multiTransfer_ABI, wallet)

	const payList = _payList.map(n => n.split('.')[0])
	let total = 0
	payList.forEach(n => total += parseFloat(n)/10**18)
	let tx
	try{
		tx = await contract.multiTransfer (conet_point_contract, nodes, payList)
	} catch(ex) {
		provide_write = new ethers.JsonRpcProvider(CONET_Holesky_write) 
		nonceLock.cnptReferralAdmin = false
		return logger (colors.red(`Send to Referrals [${ nodes.length }] ERROR, Try make new provide RPC`), ex)
	}
	nonceLock.cnptReferralAdmin = false
	return logger (colors.magenta (`Send to Referrals success! total wallets ${ nodes.length }] Total CNTP = [${total}]`))

}

const CNTPMasterWallet = '0x44d1FCCce6BAF388617ee972A6FB898b6b5629B1'
const CNTPReferralWallet = '0x63377154F972f6FC1319e382535EC9691754bd18'

export const getWalletBalance1 = () => {
	
}

export const getCNTPMastersBalance = async (privateKey: string) => {
	const wallet = new ethers.Wallet(privateKey, provideReader)
	const contract = new ethers.Contract(conet_point_contract, CONET_Point_ABI, wallet)
	let CNTPMasterBalance, CNTPReferralBalance
	try {
		CNTPMasterBalance = ethers.formatEther(await contract.balanceOf(CNTPMasterWallet))
		CNTPReferralBalance = ethers.formatEther(await contract.balanceOf(CNTPReferralWallet))
	} catch (ex) {
		provideReader = new ethers.JsonRpcProvider(CONET_Holesky_read)
		logger(colors.red(`getCNTPMastersBalance contract.balanceOf Error`))
		return null
	}
	return {CNTPMasterBalance, CNTPReferralBalance}
	
}

const CalculateReferrals = async (walletAddress: string, totalToken: string, rewordArray: number[], checkAddressArray: string[], privateKey: string, ReferralsMap: Map<string, string>, CallBack: (err:Error|null, data?: any) => void) => {
	let _walletAddress = walletAddress.toLowerCase()
	if (checkAddressArray.length) {
		const index = checkAddressArray.findIndex(n => n.toLowerCase() === _walletAddress)
		if (index <0) {
			return CallBack (new Error(`CalculateReferrals walletAddress [${_walletAddress}] hasn't in checkAddressArray! STOP CalculateReferrals`))
		}
	}
	const wallet = new ethers.Wallet(privateKey, provide_write)
	const contract = new ethers.Contract(conet_Referral_contract, CONET_Referral_ABI, wallet)
	
	const addressList: string[] = []
	const payList: string[] = []
	
	for (let i of rewordArray) {
		let address: string

		try{
			address = ReferralsMap.get(_walletAddress) || await contract.getReferrer(_walletAddress)
		} catch (ex: any) {
			provide_write = new ethers.JsonRpcProvider(CONET_Holesky_write)
			continue
		}
		
		// logger (colors.blue(`CalculateReferrals get address = [${address}]`))
		if (address == '0x0000000000000000000000000000000000000000') {
			continue
		}
		ReferralsMap.set(_walletAddress, address)
		address = address.toLowerCase()
		if (checkAddressArray.length) {
			const index = checkAddressArray.findIndex(n => n.toLowerCase() === address)
			if (index< 0) {
				return CallBack(new Error(`CalculateReferrals walletAddress [${_walletAddress}'s up layer address ${address}] hasn't in checkAddressArray! STOP CalculateReferrals`))
			}
		}
		addressList.push(address)
		payList.push((parseFloat(totalToken)*i).toString())
		_walletAddress = address
	}

	CallBack(null, {addressList, payList})
}

/**
 * 
 * 		TEST 
 * 
 */


const walletAddress = [
	'0xd3517e19A8F74c7f5AE1e0374d98b0432bce144B',
	'0x8b02ec615B7a2d5B82F746F990062459DF996c48',
	'0x7Bc3FEA6Fc415CD1c36cf5CCA31786Cb3823A4b2',
	'0x3b2Ae491CEADaA454c99Bd3f64377e1EB66B9F38',
	'0xd1A18F6aa5bC2b4928C313F1bDbE9f5799f1A2db',
	'0xd0D7006c30549fE2932b543815Fde2FB45a3AAEB',
	'0x6eaE0202053c5aEf1b57911fec208f08D96050DE',
	'0x295bA944D9a7e7b2c5EfC0e96b7a063c685F7c7d',
	'0x24D074530bB9526a67369b67FCf1Fa6cf6ef6845',
	'0x060FC4A81a51393C3077B024b99f2DE63F020DdE',
	'0x335Cf03756EF2B667a1F892F4382ce03b919265b',
	'0x019Ed74EF161AD1789bd2c61E39511A7E41b76c1',
	'0xE30B823Aeb7d199D980b7480EC5667108DC583DD',
	'0xf2e12cc4C09858AF1330b85E2c8A5aaD7b39Bf3C',
	'0x04441E4BC3A8842473Fe974DB4351f0b126940be',
	'0x4fa1FC4a2a96D77E8521628268631F735E2CcBee',
	'0x12F3f8ac3966fed21Ec764E17d5d5D3fB1A4CBfD',
	'0xcB25daB10170853C7626563D02af554fF34C0AbC',
	'0xE101DE43c80A443F9F26CA6CEE4FDBE65874675d',
	'0xaC9D75BF43CfDC5Ee13F11fd68006747C4578b15',
	'0x831d6eA26B944834741994adbe96a9097B67176E',
	'0xc68b2D00460c4b7396228d25Da771ade44Ff421C',
	'0x3d4b4265a596705245906B856de058F4BFde9979',
	'0x9765ec98E6D04e5C6eC097F6f360990c81D2114d',
	'0x4a287A601Cf17A817fd764348cB0190cac68fbD1',
	'0xbb06908a2AC01e42eBD93C4F5612B66BD4c7cBF6',
	'0x28f1f457412074261F77A361Bd830134c5B32bd9',
	'0x7B6732Ff1E9d9Be90DbDc3AaF5079DBD59f8077a',
	'0xe21864bc255f545FAa86EEE6fe24E16E2aD7Af92',
	'0xBD5e3a971327D0cdB30E06f6b7eEAd70e077Fb4F',
	'0x6ebeBa25604079f8D993346c527646b8AD457ab3',
	'0x7f212bEd5c8DF3027946Abc23e44A59ac5573aF2',
	'0xADa0dB32D41e94192e167AdA206a3CFeA06e1f56',
	'0x703173F256428e66989B2f63Cb7E9Ca02954ad54',
	'0x092d2400E2C91B477fF2a244e7E806aA85c9114e',
	'0xe0552C596B8E827dCa24bA5Fa93EE4eEa5819cCe',
	'0x284AB0a1CD508a5B5a7cFCcADF49a69eEb442Bc7',
	'0x4452425daFaf1B77f1eD4Ed5af83e5D6e5fF437f',
	'0x35da437eE14b914bbF560f66Ba02ed60961cf127',
	'0xe1ec8296Ae494f4cA7a8769B02933300218A31D3',
	'0x0904CB73aB9Df2B0172143ebc3132583069329eF',
	'0xF13f7edFDDfE22C5ca428Fd0f22BD12ca39dC0C7',
	'0xdC1023608237b77278a46846c5E663B68F9B61a2',
	'0x133EF0700E58C3CBDdE28f2790CFb366e9ac0d2F',
	'0x382ce03cf62C8d6bbE7E14c4f527f365Ee823d3d',
	'0xCa16Bf2b01F473232515324222b37627Ea523714',
	'0x7Fdf3457919BB50EF558048c4d49Fd45434409E8',
	'0xCd8641563B156B0Ee4d1e243847335D4c246f05a',
	'0xB3e8e527175840c7020758a20B2508bB50CC1Fc8'

]

// const pay = [
// 	//-		part 1
// 		'10000000',
// 		'712,080.2088968978997845',
// 		'712,080.2088968978997845',
// 		'712,080.2088968978997845',
// 		'317,740.5420389562207995',
// 		'317,740.5420389562207995',
// 		'317,740.5420389562207995',
// 		'317,740.5420389562207995',
// 		'317,740.5420389562207995',
// 		'317,740.5420389562207995',
// 		'274,369.9289633894777815',
// 		'210,404.78313705386293',
// 		'86,895.8520915785328927',
// 		'73,814.3557290577106485',
// 		'73,814.3557290577106485',
// 		'63,089.0034717687458195',
// 		'62,085.7010157038992415',
// 		'19,779.50028',
// 		'17,969.5872678328812625',
// 		'17,662.0559148173131204',
// 		'13,389.600368767035147',
// 		'10,107.1825889077348825',
// 		'8,225.94755728701111373',
// 		'7,822.09965935810095851',
// 		'6,690.0698032545706855',
// 		'6,465.88534606413031858',
// 		'6,410.85390672380109721',
// 		'6,042.25363505936159426',
// 		'6,019.3840315598869939',
// 		'4,467.57383007996075676',
// 		'3,774.1097975016103165',
// 		'3,495.3906678586238645',
// 		'3,490.1094276094275215',
// 		'2,967.511898432950911',
// 		'2,769.3400916782937146',
// 		'2,698.8498272178704653',
// 		'1,838.1566992678103125',
// 		'1,773.86260480817720158',
// 		'1,638.72565698786269571',
// 		'1,612.36482410980776862',
// 		'1,364.15341455614757525',
// 		'1,352.73054370505805076',
// 		'1,292.09966282845720281',
// 		'768.045116313117274',
// 		'742.2438672438672265',
// 		'710.4857050032488275',
// 		'700.536062378167598',
// 		'637.9661833576207976',
// 		'608.79174266952924667'
// 	//-	part 2


// ]


// const marginArray = (addressList: string[], payList: string[]) => {
// 	const datareturn  = {addressList: [], payList:[]}
// 	let kk = addressList.pop()
// 	if (!kk) {
// 		return (datareturn)
// 	}
// 	let ll = parseFloat(datareturn.payList[0])

// 	const check: () => any = () => {
// 		const index = addressList.findIndex(n => n === datareturn.addressList[datareturn.addressList.length-1])
// 		if (index < 0) {
// 			if (kk) {
// 				datareturn.addressList.push(kk)
// 				const add = addressList.pop()
// 			}
			
// 			if (!add) {
// 				return 
// 			}
// 			datareturn.addressList.push(add)
// 			kk = payList.pop()
// 			if (!kk) {
// 				return
// 			}
// 			ll = parseFloat(kk)
// 			return check()
// 		}

// 		addressList.splice(index, 1)
// 		const lll = payList.splice(index, 1)[0]
// 		if (lll) {
// 			ll += parseFloat(lll)
// 		} else {
// 			logger (colors.red(`marginArray Error! lll === null`), inspect(payList))
// 			return
// 		}
// 		return check()
// 	}
// 	check()
// 	return {}
// }


const addReferral = async () => {
	const seven = [
		// ['0x295bA944D9a7e7b2c5EfC0e96b7a063c685F7c7d', '0xd0D7006c30549fE2932b543815Fde2FB45a3AAEB'],
		// ['0x335Cf03756EF2B667a1F892F4382ce03b919265b', '0xd0D7006c30549fE2932b543815Fde2FB45a3AAEB'],
		// ['0x4a287A601Cf17A817fd764348cB0190cac68fbD1', '0xd0D7006c30549fE2932b543815Fde2FB45a3AAEB'],

		// ['0xf2e12cc4C09858AF1330b85E2c8A5aaD7b39Bf3C', '0x019Ed74EF161AD1789bd2c61E39511A7E41b76c1'],
		// ['0x019Ed74EF161AD1789bd2c61E39511A7E41b76c1', '0x060FC4A81a51393C3077B024b99f2DE63F020DdE'],
		// ['0x522d89e0C5c8d53D9656eA0f33efa20a81bd76c6', '0x060FC4A81a51393C3077B024b99f2DE63F020DdE'],
		// ['0x060FC4A81a51393C3077B024b99f2DE63F020DdE', '0x318a3927EBDE5e06b0f9c7F1012C84e69916f5Fc'],
		// ['0x318a3927EBDE5e06b0f9c7F1012C84e69916f5Fc', '0x8b02ec615B7a2d5B82F746F990062459DF996c48'],
		// ['0xE30B823Aeb7d199D980b7480EC5667108DC583DD', '0x8b02ec615B7a2d5B82F746F990062459DF996c48'],

		// ['0xd1A18F6aa5bC2b4928C313F1bDbE9f5799f1A2db', '0x24D074530bB9526a67369b67FCf1Fa6cf6ef6845'],
		// ['0x24D074530bB9526a67369b67FCf1Fa6cf6ef6845', '0xBA34Ac9dabF6eF33Dd1A666675bDD52264274A7c'],
		// ['0x6eaE0202053c5aEf1b57911fec208f08D96050DE', '0x518b2eb8dffe6e826C737484c9f2Ead6696C7A44'],
		// ['0x518b2eb8dffe6e826C737484c9f2Ead6696C7A44', '0x6F226df857fFA0d1f8C3C0533db06e7E6042CCc7'],
		// ['0xBA34Ac9dabF6eF33Dd1A666675bDD52264274A7c', '0x2BD9D9EB221bd4e60b301C0D25Aa7c7829e76De3'],
		// ['0x6F226df857fFA0d1f8C3C0533db06e7E6042CCc7', '0x2BD9D9EB221bd4e60b301C0D25Aa7c7829e76De3'],
		// ['0x3A67775d2634BDC09336a7d2836016eA211B4F32', '0x2BD9D9EB221bd4e60b301C0D25Aa7c7829e76De3'],

		// ['0xEdd67DdD7870609461A606A2502ad6e8959e44E3', '0x2BD9D9EB221bd4e60b301C0D25Aa7c7829e76De3'],

		// ['0x12F3f8ac3966fed21Ec764E17d5d5D3fB1A4CBfD', '0x1Afc1Fcb4eC4931F1EA8B38026b93a7A8482A813'],
		// ['0x1Afc1Fcb4eC4931F1EA8B38026b93a7A8482A813', '0xc9043f661ADddCAF902d45D220e7aea38920d188'],
		// ['0xc9043f661ADddCAF902d45D220e7aea38920d188', '0xDBaa41dd7CABE1D5Ca41d38E8F768f94D531d85A'],
		// ['0xDBaa41dd7CABE1D5Ca41d38E8F768f94D531d85A', '0x4fa1FC4a2a96D77E8521628268631F735E2CcBee'],
		// ['0x4fa1FC4a2a96D77E8521628268631F735E2CcBee', '0x04441E4BC3A8842473Fe974DB4351f0b126940be'],
		// ['0x04441E4BC3A8842473Fe974DB4351f0b126940be', '0x8b02ec615B7a2d5B82F746F990062459DF996c48'],

		// ['0x8b02ec615B7a2d5B82F746F990062459DF996c48', '0x7Bc3FEA6Fc415CD1c36cf5CCA31786Cb3823A4b2'],
		// ['0x7Bc3FEA6Fc415CD1c36cf5CCA31786Cb3823A4b2', '0x3b2Ae491CEADaA454c99Bd3f64377e1EB66B9F38'],
		// ['0xDf6bA415F39CFd294F931eb54067cDC872B1d2B5', '0x3A67775d2634BDC09336a7d2836016eA211B4F32'],
		// ['0x9F550F2E95df1Fd989da56f3cB706E3E839F7b5e', '0xDf6bA415F39CFd294F931eb54067cDC872B1d2B5'],

		// ['0xB8f7bDfFee7C74B8d6619eB374d42AD5f89C626a', '0xEdd67DdD7870609461A606A2502ad6e8959e44E3'],
		// ['0xC1E6ccf826322354ae935e15e750DFF6a6Ad1BfC', '0xB8f7bDfFee7C74B8d6619eB374d42AD5f89C626a'],

		// ['0x368B873f37bc15e1bE12EeA0BDE1f0bbb9192bB8', '0x12F3f8ac3966fed21Ec764E17d5d5D3fB1A4CBfD'],
	
		// ['0xD130bB620f41838c05C65325b6ee84be1D4B4701','0xAF34d323683d8bA040Dac24cc537243AeC319A30'],



		['0xAF34d323683d8bA040Dac24cc537243AeC319A30', '0xb1C01c53fcDA4E968CE21Af8055392779239eF1b'],
		['0xb1C01c53fcDA4E968CE21Af8055392779239eF1b', '0x93AC5b9b1305616Cb5B46a03546356780FF6c0C7'],
		['0x93AC5b9b1305616Cb5B46a03546356780FF6c0C7','0x12F3f8ac3966fed21Ec764E17d5d5D3fB1A4CBfD']

	]
	const nonceLock: nonceLock = {
		conetPointAdmin: false,
		cnptReferralAdmin: false
	}
	const _series = seven.map (n => async (next: () => void) => await checkReferralSign(n[0], n[1], new Map(), '', nonceLock))

	series(_series, err => {
		logger (colors.magenta(`success!`))
	})
	
	// const n = seven[0]
	// const yyy = await checkReferralSign(n[0], n[1], '')
	// logger (colors.blue(`await checkReferralSign return ${yyy}`))
}


const test2 = async () => {
	const kk = '0x295bA944D9a7e7b2c5EfC0b7a063c685F7c7d'
	const uu = {
		nodeList: [
		  '0x8b02ec615B7a2d5B82F746F990062459DF996c48',
		  '0x7Bc3FEA6Fc415CD1c36cf5CCA31786Cb3823A4b2',
		  '0x3b2Ae491CEADaA454c99Bd3f64377e1EB66B9F38',
		  '0x24D074530bB9526a67369b67FCf1Fa6cf6ef6845',
		  '0xd1A18F6aa5bC2b4928C313F1bDbE9f5799f1A2db',
		  '0x6eaE0202053c5aEf1b57911fec208f08D96050DE',
		  '0x295bA944D9a7e7b2c5EfC0e96b7a063c685F7c7d',
		  '0xd0D7006c30549fE2932b543815Fde2FB45a3AAEB',
		  '0x060FC4A81a51393C3077B024b99f2DE63F020DdE',
		  '0x335Cf03756EF2B667a1F892F4382ce03b919265b',
		  '0x019Ed74EF161AD1789bd2c61E39511A7E41b76c1',
		  '0x04441E4BC3A8842473Fe974DB4351f0b126940be',
		  '0xf2e12cc4C09858AF1330b85E2c8A5aaD7b39Bf3C',
		  '0x4fa1FC4a2a96D77E8521628268631F735E2CcBee',
		  '0x12F3f8ac3966fed21Ec764E17d5d5D3fB1A4CBfD',
		  '0x4a287A601Cf17A817fd764348cB0190cac68fbD1',
		  '0x74eDC24c5559A5f39506aa09A406F250808694Ec',
		  '0xDf6bA415F39CFd294F931eb54067cDC872B1d2B5',
		  '0x9F550F2E95df1Fd989da56f3cB706E3E839F7b5e',
		  '0xE30B823Aeb7d199D980b7480EC5667108DC583DD',
		  '0x2BD9D9EB221bd4e60b301C0D25Aa7c7829e76De3',
		  '0xBA34Ac9dabF6eF33Dd1A666675bDD52264274A7c',
		  '0x6F226df857fFA0d1f8C3C0533db06e7E6042CCc7',
		  '0x3A67775d2634BDC09336a7d2836016eA211B4F32',
		  '0x518b2eb8dffe6e826C737484c9f2Ead6696C7A44',
		  '0x318a3927EBDE5e06b0f9c7F1012C84e69916f5Fc',
		  '0x522d89e0C5c8d53D9656eA0f33efa20a81bd76c6',
		  '0xDBaa41dd7CABE1D5Ca41d38E8F768f94D531d85A',
		  '0xc9043f661ADddCAF902d45D220e7aea38920d188',
		  '0x1Afc1Fcb4eC4931F1EA8B38026b93a7A8482A813'
		],
		nodePay: [
		  '2448830409356725000', '2448830409356725000',
		  '2448830409356725000', '2448830409356725000',
		  '2448830409356725000', '2448830409356725000',
		  '2448830409356725000', '2448830409356725000',
		  '2448830409356725000', '2448830409356725000',
		  '2448830409356725000', '2448830409356725000',
		  '2448830409356725000', '2448830409356725000',
		  '2448830409356725000', '2448830409356725000',
		  '2448830409356725000', '2448830409356725000',
		  '2448830409356725000', '2265712682379348800',
		  '2265712682379348800', '2265712682379348800',
		  '2265712682379348800', '2265712682379348800',
		  '2265712682379348800', '2265712682379348800',
		  '2265712682379348800', '2265712682379348800',
		  '2265712682379348800', '2265712682379348800'
		],
		addressList: [
		  '0x3b2Ae491CEADaA454c99Bd3f64377e1EB66B9F38',
		  '0x7Bc3FEA6Fc415CD1c36cf5CCA31786Cb3823A4b2',
		  '0x3b2Ae491CEADaA454c99Bd3f64377e1EB66B9F38',
		  '0xba34ac9dabf6ef33dd1a666675bdd52264274a7c',
		  '0x2bd9d9eb221bd4e60b301c0d25aa7c7829e76de3',
		  '0x24d074530bb9526a67369b67fcf1fa6cf6ef6845',
		  '0xba34ac9dabf6ef33dd1a666675bdd52264274a7c',
		  '0x2bd9d9eb221bd4e60b301c0d25aa7c7829e76de3',
		  '0xd0d7006c30549fe2932b543815fde2fb45a3aaeb',
		  '0x518b2eb8dffe6e826c737484c9f2ead6696c7a44',
		  '0x6f226df857ffa0d1f8c3c0533db06e7e6042ccc7',
		  '0x2bd9d9eb221bd4e60b301c0d25aa7c7829e76de3',
		  '0xd0d7006c30549fe2932b543815fde2fb45a3aaeb',
		  '0x318a3927ebde5e06b0f9c7f1012c84e69916f5fc',
		  '0x8b02ec615B7a2d5B82F746F990062459DF996c48',
		  '0x7Bc3FEA6Fc415CD1c36cf5CCA31786Cb3823A4b2',
		  '0x060fc4a81a51393c3077b024b99f2de63f020dde',
		  '0x318a3927ebde5e06b0f9c7f1012c84e69916f5fc',
		  '0x8b02ec615B7a2d5B82F746F990062459DF996c48',
		  '0x8b02ec615B7a2d5B82F746F990062459DF996c48',
		  '0x7Bc3FEA6Fc415CD1c36cf5CCA31786Cb3823A4b2',
		  '0x3b2Ae491CEADaA454c99Bd3f64377e1EB66B9F38',
		  '0x019ed74ef161ad1789bd2c61e39511a7e41b76c1',
		  '0x060fc4a81a51393c3077b024b99f2de63f020dde',
		  '0x318a3927ebde5e06b0f9c7f1012c84e69916f5fc',
		  '0x04441e4bc3a8842473fe974db4351f0b126940be',
		  '0x8b02ec615B7a2d5B82F746F990062459DF996c48',
		  '0x7Bc3FEA6Fc415CD1c36cf5CCA31786Cb3823A4b2',
		  '0xd0d7006c30549fe2932b543815fde2fb45a3aaeb',
		  '0x1afc1fcb4ec4931f1ea8b38026b93a7a8482a813',
		  '0xc9043f661adddcaf902d45d220e7aea38920d188',
		  '0xdbaa41dd7cabe1d5ca41d38e8f768f94d531d85a',
		  '0xdf6ba415f39cfd294f931eb54067cdc872b1d2b5',
		  '0x2bd9d9eb221bd4e60b301c0d25aa7c7829e76de3',
		  '0x8b02ec615B7a2d5B82F746F990062459DF996c48',
		  '0x7Bc3FEA6Fc415CD1c36cf5CCA31786Cb3823A4b2',
		  '0x3b2Ae491CEADaA454c99Bd3f64377e1EB66B9F38',
		  '0x2bd9d9eb221bd4e60b301c0d25aa7c7829e76de3',
		  '0x2bd9d9eb221bd4e60b301c0d25aa7c7829e76de3',
		  '0x6f226df857ffa0d1f8c3c0533db06e7e6042ccc7',
		  '0x2bd9d9eb221bd4e60b301c0d25aa7c7829e76de3',
		  '0x8b02ec615B7a2d5B82F746F990062459DF996c48',
		  '0x7Bc3FEA6Fc415CD1c36cf5CCA31786Cb3823A4b2',
		  '0x3b2Ae491CEADaA454c99Bd3f64377e1EB66B9F38',
		  '0x060fc4a81a51393c3077b024b99f2de63f020dde',
		  '0x318a3927ebde5e06b0f9c7f1012c84e69916f5fc',
		  '0x8b02ec615B7a2d5B82F746F990062459DF996c48',
		  '0x4fa1fc4a2a96d77e8521628268631f735e2ccbee',
		  '0x04441e4bc3a8842473fe974db4351f0b126940be',
		  '0x8b02ec615B7a2d5B82F746F990062459DF996c48',
		  '0xdbaa41dd7cabe1d5ca41d38e8f768f94d531d85a',
		  '0x4fa1fc4a2a96d77e8521628268631f735e2ccbee',
		  '0x04441e4bc3a8842473fe974db4351f0b126940be',
		  '0xc9043f661adddcaf902d45d220e7aea38920d188',
		  '0xdbaa41dd7cabe1d5ca41d38e8f768f94d531d85a',
		  '0x4fa1fc4a2a96d77e8521628268631f735e2ccbee',
		  '0xede7aec4268858c68d84048194c832b8ffb01f9e',
		  '0x6d25ed5a25e36b21d5db078d2c2e9d2b8ad52b27',
		  '0x364484b48fac0343631a06ddc5583c856e96bc12',
		  '0xc91d74fb5740ebb12d8f9c8b3472789a08d03cac',
		  '0xe5dbb468652d83fa04d7f98c71bfe5847c03fe19',
		  '0xee5149adefbe76c41cbd844418d9578b5fac2675',
		  '0xe5dbb468652d83fa04d7f98c71bfe5847c03fe19',
		  '0xf7f40b77c761f0848c0c710b215e00f1784a7777',
		  '0x33e601b40fe84842ab2c7f1730229176cd7f33e2',
		  '0x45a1c0381da7f18c0914ca095e37295194339792',
		  '0x36067f545845269f1d7c7e6835b19041a34f3f0d',
		  '0xba072658e4f5efec76325494ccd1f4be3dd22601',
		  '0x0cee80a35751ed63a9ab837ab0561c4439fcb03a',
		  '0xfd576b298430cc07e833457498edc22fd9cdaed1',
		  '0xc9750dcc7cd287fc05f4f8ea1910870f09888151',
		  '0xd495fb0754650df396eec997528dacc9027023a8',
		  '0x0cee80a35751ed63a9ab837ab0561c4439fcb03a',
		  '0x80b71bf9a80265d17fe7044fe7ab793427924891',
		  '0x55467dc69a9203a7bfa6e5964724b6aaef900114',
		  '0x19e9a15d6499be5163fddeb50674966683ce4a2c',
		  '0xcc88dbf46028927e3e26787c2a6d840c47b731b9',
		  '0x796dbcf485452b3e72bdc7fdc58126ff545a4578',
		  '0x5a0762d7f4001802dc9fb37d51e5ab722a3c2f21',
		  '0xfc61c4f9967f13d933596d5f72fb72121530b061',
		  '0xa5b8f284e689b58dd15083bd34b820906b12f481',
		  '0x0828439498d526dc3fd720883eea732585f2c6be',
		  '0xe5dbb468652d83fa04d7f98c71bfe5847c03fe19',
		  '0xc6d03ec70f11eefb0215b91120062951c7f3e332',
		  '0x9cb254b774af7a9950ac93eff8745fb91b3235bc',
		  '0xb1473ef0468d34e6f0b52240e1584265565c4434',
		  '0x9e08605a6dea875c7999ee44ae497411153c93d0',
		  '0x263e9ddcae191c360a139680cb5239314ef01f41',
		  '0x9cb254b774af7a9950ac93eff8745fb91b3235bc',
		  '0xb1473ef0468d34e6f0b52240e1584265565c4434',
		  '0x0cee80a35751ed63a9ab837ab0561c4439fcb03a',
		  '0xc8fcef25bd8fcf6d582e5d96acca5cb0270b31fc',
		  '0x0cee80a35751ed63a9ab837ab0561c4439fcb03a',
		  '0x456a46094cc5254575ab10c0eb14ef65ef07f181',
		  '0x089c10ef2c7c9162fa9f1932f7638c2e9e59062b',
		  '0x2218c25fb4a594e77ec2734ef46ff510ba747995',
		  '0x02a8d162fddee29d32e58bcf89c7edd5ad444347',
		  '0x9cb254b774af7a9950ac93eff8745fb91b3235bc',
		  '0xb1473ef0468d34e6f0b52240e1584265565c4434'
		],
		payList: [
		  '489766081871345100', '489766081871345100', '244883040935672540',
		  '489766081871345100', '244883040935672540', '489766081871345100',
		  '244883040935672540', '122441520467836270', '489766081871345100',
		  '489766081871345100', '244883040935672540', '122441520467836270',
		  '489766081871345100', '489766081871345100', '244883040935672540',
		  '122441520467836270', '489766081871345100', '244883040935672540',
		  '122441520467836270', '489766081871345100', '244883040935672540',
		  '122441520467836270', '489766081871345100', '244883040935672540',
		  '122441520467836270', '489766081871345100', '244883040935672540',
		  '122441520467836270', '489766081871345100', '489766081871345100',
		  '244883040935672540', '122441520467836270', '489766081871345100',
		  '453142536475869760', '453142536475869760', '226571268237934880',
		  '113285634118967440', '453142536475869760', '453142536475869760',
		  '453142536475869760', '226571268237934880', '453142536475869760',
		  '226571268237934880', '113285634118967440', '453142536475869760',
		  '226571268237934880', '113285634118967440', '453142536475869760',
		  '226571268237934880', '113285634118967440', '453142536475869760',
		  '226571268237934880', '113285634118967440', '453142536475869760',
		  '226571268237934880', '113285634118967440', '6797472075249853',
		  '6797472075249853',   '4078483245149911.5', '6797472075249853',
		  '4078483245149911.5', '6797472075249853',   '4078483245149911.5',
		  '6797472075249853',   '6797472075249853',   '6797472075249853',
		  '6797472075249853',   '6797472075249853',   '6797472075249853',
		  '6797472075249853',   '6797472075249853',   '6797472075249853',
		  '6797472075249853',   '6797472075249853',   '4078483245149911.5',
		  '6797472075249853',   '4078483245149911.5', '6797472075249853',
		  '4078483245149911.5', '1359494415049970.5', '6797472075249853',
		  '6797472075249853',   '6797472075249853',   '6797472075249853',
		  '4078483245149911.5', '1359494415049970.5', '6797472075249853',
		  '6797472075249853',   '6797472075249853',   '4078483245149911.5',
		  '6797472075249853',   '6797472075249853',   '6797472075249853',
		  '6797472075249853',   '6797472075249853',   '4078483245149911.5',
		  '6797472075249853',   '4078483245149911.5', '1359494415049970.5'
		]
	}

	const hhh = '{"message":"{\\"walletAddress\\":\\"0x5CF66CD8978AB4EE32EE5C28BF9F7CFDDBC232EF\\"}","signMessage":"0x0cd147236382264866525213a34ab4dbfea18b2968968cef86ed3190163d8eef7a6bea104f1c8d8d82ff2cfc8b9711ef882a9ca389fba1071bc9e8bf0c44cf561c"}'
	// const balance = await getCNTPMastersBalance('')
	//const balance = await getWalletAssetBalance(kk, '')

	// const node:nodeType[] = kkk.node
	// await getNodesBalance(node, '')

	// logger(inspect(node.map(n => n.balance), false, 3, true))
	//const kks = mergeTransfers(uu.addressList, uu.payList)
	
	// logger(colors.magenta(`nodes length = ${kks.returnNodeList.length} pay length = ${kks.returnPay.length}`))
}

/** */



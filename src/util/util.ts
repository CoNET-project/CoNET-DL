import type { RequestOptions } from 'node:http'

import { stat, mkdir, writeFile, readFile, link } from 'node:fs'
import { homedir, networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { get, request } from 'node:http'
import {reverse} from 'node:dns'
import {request as HttpsRequest, get as HttpsGet} from 'node:https'
import Cluster from 'node:cluster'
import { inspect } from 'node:util'
import { exec } from 'node:child_process'
import { createInterface } from 'readline'
import { publicKeyByPrivateKey, cipher, decryptWithPrivateKey, hex, recover, hash, sign } from 'eth-crypto'
import { Buffer } from 'buffer'
import { readCleartextMessage, verify, readKey, readMessage, readPrivateKey, decryptKey, decrypt, generateKey } from 'openpgp'
import type { GenerateKeyOptions, Key, PrivateKey, Message, MaybeStream, Data, DecryptMessageResult, WebStream, NodeStream } from 'openpgp'
import { Writable } from 'node:stream'
import colors from 'colors/safe'
import {ethers} from 'ethers'
import JSBI from 'jsbi'
import {getOraclePrice,txManager} from '../endpoint/help-database'

import {abi as CONET_Point_ABI} from './conet-point.json'
import {abi as CONET_Referral_ABI} from './conet-referral.json'

import {abi as CONET_Referral_blast_v2} from './conet-referral-v2.json'
import {abi as CONET_Point_blast_v1} from './const-point-v1-blast.json'
import {abi as claimableToken } from './claimableToken.json'

import {abi as GuardianNodesV2ABI} from './GuardianNodesV2.json'
import {abi as erc20TokenABI} from './erc20.json'


import S3, {S3Client, PutObjectCommand} from '@aws-sdk/client-s3'


export const conet_Holesky_rpc = 'https://rpc.conet.network'
const bscMainchainRPC = 'https://bsc-dataseed.binance.org/'
const balstMainchainRPC = 'https://rpc.ankr.com/blast'

const ethMainchainRPC = 'https://eth-mainnet.g.alchemy.com/v2/dxNi8w6owhHdzNZPXQPeppST3CqFRO-F'
let provide_write = new ethers.JsonRpcProvider(conet_Holesky_rpc)
let provideReader = new ethers.JsonRpcProvider(conet_Holesky_rpc)
let blast_current = 0
const blast_EndPoints = ['https://wispy-greatest-telescope.blast-sepolia.quiknode.pro/eed482657dac9ab72cc8e710fa88ab4d6462cb98/', 'https://rpc.ankr.com/blast_testnet_sepolia','https://rpc.ankr.com/blast_testnet_sepolia/5e384380ae112067a637c50b7d8f2a3050e08db459e0a40a4e56950c7a27fc76','https://divine-lingering-water.blast-sepolia.quiknode.pro/be6893e1b1f57bac9a6e1e280f5ad46fddd6c146/']

const getProvider_Blast = () => {
	if (++blast_current > blast_EndPoints.length - 1) {
		blast_current = 0
	}
	const uu = new ethers.JsonRpcProvider(blast_EndPoints[blast_current])
	//@ts-ignore
	uu["endpoint_url"] = blast_EndPoints[blast_current]
	return uu
}

const rpcs = ['https://a3c6a17769809e43.conet.network', 'https://ee62a6be24b3c4581defb76b7d.conet.network']
let pointToRPC = 0

const conet_point_contract = `0x113E91FC4296567f95B84D0FacDa6fC29c5E7238`.toLowerCase()

const conet_Referral_oldcontractV2 = '0x64Cab6D2217c665730e330a78be85a070e4706E7'.toLowerCase()

const conet_Referral_contractv3 = '0x8f6be4704a3735024F4D2CBC5BAC3722c0C8a0BD'.toLowerCase()

const CNTP_HoleskyMultiTransfer = '0x94217083059e7D1eFdd9D9f95039A43329D532ac'.toLowerCase()
const CONET_Stroage_Contract = '0x7d9CF1dd164D6AF82C00514071990358805d8d80'.toLowerCase()
const conet_ERC20_MultiTransfer_contract_blast = '0x8c40ecFE10665FA66C1De087b5e188916C73DB96'.toLowerCase()
const CNTP_Referral_contract_Blast = '0x76e68E0B3d088e52e1e7B714ddC57eBbE94c52c4'.toLowerCase()
const preNFTSmartCOntract = '0xddbC4Bcd03818a673abde0671933C31a2adb14Ea'

const usdtBnbContract = '0x55d398326f99059fF775485246999027B3197955'
const usdtBlastContract = '0x4300000000000000000000000000000000000003'
const usdtETHContract = '0xdAC17F958D2ee523a2206206994597C13D831ec7'

const CONET_bnb_safeWallet = '0xeabF22542500f650A9ADd2ea1DC53f158b1fFf73'
const CONET_ETH_safeWallet = '0x1C9f72188B461A1Bd6125D38A3E04CF238f6478f'

const bnb_usdt_contract = '0x55d398326f99059fF775485246999027B3197955'
const blast_usdb_contract = '0x4300000000000000000000000000000000000003'
const conet_dWETH = '0x84b6d6A6675F830c8385f022Aefc9e3846A89D3B'
const conet_dUSDT = '0x0eD55798a8b9647f7908c72a0Ce844ad47274422'
const conet_dWBNB = '0xd8b094E91c552c623bc054085871F6c1CA3E5cAd'
const CNTPMasterWallet = '0x44d1FCCce6BAF388617ee972A6FB898b6b5629B1'
const CNTPReferralWallet = '0x63377154F972f6FC1319e382535EC9691754bd18'

export const GuardianNodes_ContractV21 = '0x5e4aE81285b86f35e3370B3EF72df1363DD05286'
const GuardianNodes_ContractV3 = '0x453701b80324C44366B34d167D40bcE2d67D6047'

const conet_point_contract_blast = `0x0E75599668A157B00419b58Ff3711913d2a716e0`


export const cCNTP_Contract = '0x530cf1B598D716eC79aa916DD2F05ae8A0cE8ee2'

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
			pass[1] = pass[1].replace(/\n/i,'')
			const ret: s3pass = {
				ACCESS_KEY: pass[0],
				SECRET_KEY: pass[1]
			}
			return resolve (ret)
		})
		
	})
}



const wasabiObj = {
	us_east_1: {
		endpoint: 'https://s3.wasabisys.com',
		Bucket: 'conet-mvp',
		Bucket_key: 'storage',
		region: 'us-east-1'
	}
}

const IPFSEndpoint = `https://ipfs.conet.network/api/getFragment/`

export const getIPFSfile: (fileName: string) => Promise<string> = async (fileName: string) => new Promise(resolve=> {

	const cloudStorageEndpointUrl = `${IPFSEndpoint}${fileName}`
	HttpsGet(cloudStorageEndpointUrl, res => {

		if (res.statusCode !== 200) {
			//logger(Colors.red(`getWasabiFile ${fileName} got response status [${res.statusCode}] Error! `))
			return resolve('')
		}
		res.once('error', err => {
			logger(colors.red(`getWasabiFile ${fileName} res Error [${err.message}]`))
			return resolve('')
		})
		let data = ''
		res.on('data', _data => {
			data+=_data
		})
		res.once ('end', () => {
			return resolve (data)
		})

	}).once('error', err => {
		logger(colors.red(`getWasabiFile HttpsRequest ${fileName} Error [${err.message}]`), err)
		return resolve('')
	})
	
})

export const getIpaddressLocaltion = (Addr: string) => {
	return new Promise((resolve) => {
		const url = `http://ip-api.com/json/${Addr}`

		const tryGetInfo: any = () => {
		
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
						const error = `getIpaddressLocaltion [${url}] response a no JSON data! 【${body}】`
						logger (colors.red(error))
						return setTimeout(() => {
							return tryGetInfo ()
						}, 500)
						
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

		const req = HttpsRequest ( option, res => {
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

export const addAttackToCluster = async (ipaddress: string) => {
	const option: RequestOptions = {
		hostname: '74.208.238.95',
		path: `/api/ipaddress`,
		port: 4100,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		}
	}
	const postData = {
		ipaddress: ipaddress
	}

	const req = await request (option, res => {
		let data = ''
		res.on('data', _data => {
			data += _data
		})
		res.once('end', () => {
			logger(colors.blue(`addAttackToCluster [${ipaddress}] success! data = [${data}]`))
		})
	})

	req.once('error', (e) => {
		logger(colors.red(`addAttackToCluster r[${ipaddress}] equest on Error! ${e.message}`))
	})

	req.write(JSON.stringify(postData))
	req.end()
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
	
	return new Promise (async resolve => {
		
			let dtx
			try {
				const address = ethers.getAddress(receiverAddress.toLowerCase())
				const tx = {
					to: address,
					// Convert currency unit from ether to wei
					value: ethers.parseEther(amountInEther)
				}
				dtx = await wallet.sendTransaction(tx)
			} catch (ex) {
				logger (colors.red(`sendCONET ethers.getAddress(${receiverAddress}) ERROR!`))
				return resolve (null)
			}
			logger(colors.magenta(`send CONET success ${dtx.hash}`))
			return resolve(dtx)
		
		
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
	let digest, recoverPublicKey, _digest
	try {
		digest = ethers.id(message)
		recoverPublicKey = ethers.recoverAddress(digest, signMess)
		ethers.getAddress(recoverPublicKey)
	} catch (ex) {
		// logger (colors.red(`checkSignObj recoverPublicKey ERROR digest = ${digest} signMess = ${signMess}`))
		return null
	}
	
	if (!recoverPublicKey || !obj?.walletAddress || recoverPublicKey.toLowerCase() !== obj?.walletAddress?.toLowerCase()) {
		logger (colors.red(`checkSignObj obj Error! !recoverPublicKey[${!recoverPublicKey}] !obj?.walletAddress[${!obj?.walletAddress}] recoverPublicKey.toLowerCase() [${recoverPublicKey.toLowerCase()}]!== obj?.walletAddress?.toLowerCase() [${recoverPublicKey.toLowerCase() !== obj?.walletAddress?.toLowerCase()}]`),inspect(obj, false, 3, true) )
		return null
	}
	obj.walletAddress = recoverPublicKey.toLowerCase()
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
export const total_pie = 77.160493827160494 * 2
// const total_pie = 0.07716*2
const nodes1_Pei = total_pie * .603
const nodes2_Pei = total_pie * .323
export const free_Pei = total_pie - nodes1_Pei - nodes2_Pei
//			0.1TB tokens / 180 days = 555555.555555555555556 /day
//			23148.148148148148148 / hour
//			385.802469135802469 / min
//			77.160493827160494 / block (5 blocks / min)


export const sendTokenToMiner = async (walletList: string[], payList: string[],  privateKey: string, nonceLock: nonceLock) => {
	if (nonceLock.conetPointAdmin) {
		return setTimeout(() => {sendTokenToMiner (walletList, payList, privateKey, nonceLock)}, 1000)
	}
	nonceLock.conetPointAdmin = true
	if (++pointToRPC > rpcs.length - 1) {
		pointToRPC = 0
	}

	let uu
	
		const wallet = new ethers.Wallet(privateKey, provide_write = new ethers.JsonRpcProvider(rpcs[pointToRPC]))
		const contract = new ethers.Contract(conet_point_contract, CONET_Point_ABI, wallet)
		try{
			uu = await contract.multiTransferToken(walletList, payList)
		} catch(ex) {
			if (++pointToRPC > rpcs.length - 1) {
				pointToRPC = 0
			}
			provide_write = new ethers.JsonRpcProvider(rpcs[pointToRPC])
			nonceLock.conetPointAdmin = false
			setTimeout(() => {
				sendTokenToMiner (walletList, payList, privateKey, nonceLock)
			}, 1000)
			
			return //logger (colors.red(`sendTokenToMiner call Error, Try make new provide RPC`))
		}
		let total = 0
		payList.forEach(n => total += parseFloat(n)/10**18)
		logger (colors.magenta (`Send to Miner success! nodes + free userDATA LENGTH [${ walletList.length }] Total CNTP = [${total}] tx=[${uu?.hash}]`))
	
	return nonceLock.conetPointAdmin = false
	
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
		const contract = new ethers.Contract(conet_Referral_contractv3, CONET_Referral_ABI, wallet)
		let referee: string, referrer: string
		try {
			referee = ethers.getAddress(_referee)
			referrer = ethers.getAddress(_referrer)
		} catch (ex) {
			logger (colors.grey(`checkReferralSign ethers.getAddress(${_referee}) || ethers.getAddress(${_referrer}) Error!`))
			provideReader = new ethers.JsonRpcProvider(conet_Holesky_rpc)
			return resolve (false)
		}
		
		if (referee === referrer) {
			logger (colors.grey(`referrer[${referrer}] == referee[${referee}]`))
			return resolve (false)
		}
		
		
		let uu: string, tt: string[]

		try{
			uu = ReferralsMap.get(referee) || await contract.getReferrer(referee)
			tt = await contract.getReferees(referee)
		} catch(ex) {
			provideReader = new ethers.JsonRpcProvider(conet_Holesky_rpc)
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
			let tx
			try{
				tx = await contract.addReferrer(referee, referrer)
			} catch (ex) {
				nonceLock.cnptReferralAdmin = false
				return logger (colors.grey(`checkReferralSign call addReferrals Error, Try make new provide RPC`), ex)
			}
			nonceLock.cnptReferralAdmin = false
			logger (colors.grey(`referrer[${referrer}] => referee[${referee}] success tx = [${tx.hash}]`))
			return resolve(true)
		}
		await waitPool()
		return resolve(true)

})


export const mergeTransfersv1 = (_nodeList: string[], pay: string[]) => {
	const walletList: string[] = []
	const payList: string[] = []
	const countList: Map<string, number> = new Map()
	const walletsPay: Map<string, number> = new Map()

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


			const itemToLowCast = item.toLowerCase()
			const floatPay = parseFloat (payItem)
			const _itemValue = walletsPay.get(itemToLowCast)||0
			const totalPay = _itemValue + floatPay

			walletsPay.set (itemToLowCast, totalPay)


			// walletList.push(item)
			// payList.push(payItem)
			// const count = countList.get (item)||0
			// countList.set (item, count+1)
			
			// const nextIndexFun = () => {
			// 	if (!_nodeList) {
			// 		return nextItem()
			// 	}

			// 	const nextIndex = _nodeList.findIndex(nn => nn === item)
			// 	//		no more item
			// 	if (nextIndex<0) {
			// 		return nextItem()
			// 	}
			// 	_nodeList.splice(nextIndex, 1)[0]
			// 	const _pay = pay.splice(nextIndex, 1)[0]
			// 	const currentIndex = payList.length - 1
			// 	const oldPay = parseFloat(payList[currentIndex])
			// 	const newPay = parseFloat(_pay)
			// 	const fixed = oldPay + newPay
			// 	payList[currentIndex] = fixed > 1000 ? fixed.toFixed(0) : fixed.toFixed(10)
			// 	nextIndexFun()
			// }

			// nextIndexFun()
		nextItem()
	}

	nextItem()

	//logger(colors.blue(`mergeTransfers length from [${beforeLength}] to [${payList.length}]`))

	walletsPay.forEach((v,k) => {
		walletList.push(k)
		payList.push(v > 100000 ? v.toFixed(0): v.toFixed(10))
	})

	return {walletList, payList}
}


export const multiTransfer_original_Blast = async (privateKey: string, nodes: string[], _payList: string[], nonceLock: nonceLock) => {
	if (nonceLock.blastConetPointAdmin) {
		return setTimeout(() => {multiTransfer_original_Blast(privateKey, nodes, _payList, nonceLock)}, 1000)
	}
	nonceLock.blastConetPointAdmin = true
	const payList = _payList.map(n => n.split('.')[0])
	let total = 0
	payList.forEach(n => total += parseFloat(n)/10**18)
	
	const provide_writeBlast = getProvider_Blast()

	const wallet = new ethers.Wallet(privateKey, provide_writeBlast)
	const contract = new ethers.Contract(conet_point_contract_blast, CONET_Point_blast_v1, wallet)

	let tx
	const _hash = ethers.hashMessage(JSON.stringify(nodes))
	try{
		tx = await contract.multiTransferToken(nodes, payList)
	} catch(ex) {
		nonceLock.blastConetPointAdmin = false
		setTimeout(() => {
			provide_writeBlast.destroy()
			
			return multiTransfer_original_Blast(privateKey, nodes, _payList, nonceLock)
		}, 1000)
		// logger(colors.blue (JSON.stringify(nodes)))
		// logger(colors.blue (JSON.stringify(_payList)))
		//@ts-ignore
		return logger (colors.red(`multiTransferBlast [${ nodes.length }] ERROR! ${provide_writeBlast.endpoint_url} HASH = [${_hash}]`))
	}
	//@ts-ignore
	logger (colors.blue (`${provide_writeBlast.endpoint_url} HASH [${_hash}] multiTransferBlast SUCCESS! ${ nodes.length }] Total CNTP = [${total}] Tx = [${tx.hash}]`))
	provide_writeBlast.destroy()
	return  nonceLock.blastConetPointAdmin = false
}

export const getCNTPMastersBalance = async (privateKey: string) => {
	const wallet = new ethers.Wallet(privateKey, provideReader)
	const contract = new ethers.Contract(conet_point_contract, CONET_Point_ABI, wallet)
	let CNTPMasterBalance, CNTPReferralBalance
	try {
		CNTPMasterBalance = ethers.formatEther(await contract.balanceOf(CNTPMasterWallet))
		CNTPReferralBalance = ethers.formatEther(await contract.balanceOf(CNTPReferralWallet))
	} catch (ex) {
		provideReader = new ethers.JsonRpcProvider(conet_Holesky_rpc)
		logger(colors.red(`getCNTPMastersBalance contract.balanceOf Error`))
		return null
	}
	return {CNTPMasterBalance, CNTPReferralBalance}
	
}


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
export const ReferralsReg_Blast: (referee: string, referrer: string, ReferralsMap: Map<string, string>, _privateKey: string, nonceLock: nonceLock)=> Promise<string|boolean> =
	 (_referee, _referrer, ReferralsMap, _privateKey, nonceLock) => new Promise ( async resolve=> {
		
		const wallet = new ethers.Wallet(_privateKey, getProvider_Blast())
		const contract = new ethers.Contract(CNTP_Referral_contract_Blast, CONET_Referral_blast_v2, wallet)
		let referee: string, referrer: string
		try {
			referee = ethers.getAddress(_referee)
			referrer = ethers.getAddress(_referrer)
		} catch (ex) {
			logger (colors.grey(`ReferralsReg_Blast ethers.getAddress(${_referee}) || ethers.getAddress(${_referrer}) Error!`))
			provideReader = new ethers.JsonRpcProvider(conet_Holesky_rpc)
			return resolve (false)
		}
		
		if (referee === referrer) {
			logger (colors.grey(`ReferralsReg_Blast referrer[${referrer}] == referee[${referee}]`))
			return resolve (false)
		}

		
		let uu: string, tt: string[]

		try{
			uu = ReferralsMap.get(referee) || await contract.getReferrer(referee)
			tt = await contract.getReferees(referee)
		} catch(ex) {
			resolve(false)
			return  logger (colors.grey(`ReferralsReg_Blast call getReferrals Error, Try make new provide RPC`), ex)
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
			if (nonceLock.blastcnptReferralAdmin) {
				return setTimeout (() => {waitPool()}, 1000)
			}
			nonceLock.blastcnptReferralAdmin = true
			let tx
			try{
				tx = await contract.addReferrer(referee, referrer)
			} catch (ex) {
				nonceLock.blastcnptReferralAdmin = false
				return logger (colors.grey(`checkReferralSign call addReferrals Error, Try make new provide RPC`), ex)
			}
			nonceLock.blastcnptReferralAdmin = false
			logger (colors.grey(`referrer[${referrer}] => referee[${referee}] success tx = [${tx.hash}]`))
			return resolve(true)
		}

		waitPool()
		return resolve(true)

})

const setupFile = join( homedir(),'.master.json' )
export const masterSetup: ICoNET_DL_masterSetup = require ( setupFile )


export const storageWalletProfile111 = (obj: {hash?: string, data?: string}, s3pass: s3pass) => {

	return new Promise (async resolve => {
		if (!obj?.hash || !obj?.data) {
			return resolve(false)
		}
		// const test = await getWasabiFile (obj.hash)

		// if (test) {
		// 	return resolve(true)
		// }

		const wo = wasabiObj.us_east_1
		
		const option: S3.S3ClientConfig = {
			credentials: {
				accessKeyId: s3pass.ACCESS_KEY,
				secretAccessKey: s3pass.SECRET_KEY
			},
			endpoint: wo.endpoint,
			region: wo.region
		}

		const s3cmd: S3.PutObjectCommandInput = {
			Bucket: wo.Bucket,
			Key: `${ wo.Bucket_key }/FragmentOcean/${obj.hash}`,
			Body: obj.data,
		}

		const s3Client = new S3Client(option)
		const command = new PutObjectCommand(s3cmd)
		let req
		try {
			req = await s3Client.send(command)
		} catch (ex: any) {
			logger(colors.red(`storageWalletProfile s3.putObject Error ${ex.message}`))
			return resolve(false)
		}
		logger(colors.grey(`storageWalletProfile hash [${ obj.hash }] data length = [${ obj.data.length }] success`))
		return resolve(true)
	})
}

export const storageIPFS = async (obj: {hash: string, data: any}, privateKey: string ) => {

		if (!obj?.hash || !obj?.data) {
			logger(colors.red(`storageIPFS Format no hash || no data Error!`))
			return false
		}

		const test = await getIPFSfile (obj.hash)

		if (test) {
			return true
		}


		logger(colors.blue(`storageIPFS start post [${obj.hash}] to ipfs.conet.network data length = ${obj.data.length}`))
		const wallet = new ethers.Wallet(privateKey)
		const message =JSON.stringify({walletAddress: wallet.address, data: obj.data, hash: obj.hash})
		const messageHash = ethers.id(message)
		const signMessage = sign(privateKey, messageHash)
		const sendData = {
			message, signMessage
		}

		const option: RequestOptions = {
			hostname: 'ipfs.conet.network',
			path: `/api/storageFragment`,
			port: 443,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			}
		}

		return await requestUrl(option, JSON.stringify(sendData))
		
	
}


const preOrder = async (txHash: string, chain: string) => {
	let txRpc = balstMainchainRPC
	let usdSmartContract = usdtBlastContract
	switch (chain) {
		case 'bsc': {
			usdSmartContract = usdtBnbContract
			return txRpc = bscMainchainRPC
		}
		case 'eth': {
			usdSmartContract = usdtETHContract
			return txRpc = ethMainchainRPC
		}
	}
	const provider = new ethers.JsonRpcProvider(txRpc)
	let tx
	try {
		tx = await provider.getTransaction(txHash)
	} catch (ex) {
		logger(ex)
		return null
	}
	if (!tx) {
		return null
	}

	const ret = {
		from: tx.from.toLowerCase(),
		to: tx.to?.toLowerCase(),
		value: parseFloat(ethers.formatEther(tx?.value||'0'))
	}

	switch (chain) {
		case 'bsc': {
			if ( ret.value > 0.0 ) {
				
			} else {
				if (ret.to !== usdSmartContract) {

				}
			}
		}
		case 'eth': {

		}
		default: {

		}
	}

}


const detailTransfer = async (transferHash: string, provideCONET: ethers.JsonRpcProvider) => {

	const transObj = await provideCONET.getTransactionReceipt(transferHash)
	
	if (transObj?.to && transObj.to.toLowerCase() === CONET_Stroage_Contract ) {
		// if (transObj.from.toLowerCase() === cntpAdminAddress) {
		// 	for (let transferLog of transObj.logs) {
		// 		const topic = transferLog.topics
		// 		if (topic) {
		// 			const kkk = ethers.getAddress('0x'+topic[2].toString().substring(26)).toLowerCase()
		// 			const rev = await transAddress (kkk)
		// 			if (typeof rev === 'string' && rev !== '0x0000000000000000000000000000000000000000') {
		// 				await transAddress (rev)
		// 			}

		// 		} else {
		// 			console.log (Colors.red(`detailTransfer topic = transferLog.topics has NONE`))
		// 			console.log(inspect(transferLog, false, 3, true))
		// 		}
				
		// 	}
			
		// 	return
			
		// }
		logger(inspect(transObj, false, 3, true))
		return console.log (colors.red(`detailTransfer from [${transObj.from}] to CONET_Stroage_Contract`))
	}
	
}

const getGuardianReferralsDetail = async (wallet: string) => {
	return await getClaimableCNTPTransfer(wallet, '0x1283Fd1d846d292b23bD16c041C1BDf3ed1015D6')
}

const getClaimableCNTPTransfer = (wallet: string, from: string) => new Promise(resolve=> {
	const reqUrl = `https://scan.conet.network/api/v2/addresses/${wallet}/token-transfers?type=ERC-20&filter=from%3A${from}&token=0x27A961F17E7244d8aA75eE19061f6360DeeDF76F`
	HttpsRequest(reqUrl, (res) => {
		let data = ''
		res.on ('data', _data => {
			data += _data
		})
		res.once ('error', err => {
			logger(colors.magenta(`getClaimableCNTPTransfer res.on Error ${err.message}`))
			return resolve (data)
		})
		res.once('end', () => {
			let ret
			try {
				ret = JSON.parse(data)
			} catch (ex) {
				logger(colors.magenta(`getClaimableCNTPTransfer JSON.parse Error ${data}`))
				return resolve (null)
			}
			return resolve (ret)
		})

	}).once ('error', err => {
		logger(colors.magenta(`getClaimableCNTPTransfer httpsGet.on Error ${err.message}`))
		return resolve (null)
	})
})
	
	



const getNetwork = (networkName: string) => {
	switch (networkName) {
		case 'CNTP':
		case 'usdb': {
			return balstMainchainRPC
		}
		
		// case 'dUSDT':
		// case 'dWBNB':
		// case 'dWETH':
		// case 'conet':
		// case 'cntpb': {
		// 	return conet_Holesky_rpc
		// }
		case 'usdt': {
			return ethMainchainRPC
		}

		case 'wusdt':{
			return bscMainchainRPC
		}

		default : {
			return ''
		}
	}
}

export const checkTx =  async (txHash: string, tokenName: string) => {
	const rpc = getNetwork(tokenName)
	if (!rpc) {
		return null
	}
	const provide = new ethers.JsonRpcProvider(rpc)
	
	try {
		const [tx, tx1] = await Promise.all([
			provide.getTransactionReceipt(txHash),
			provide.getTransaction(txHash)
		])
		await tx1?.wait()
		return {tx, tx1}
	} catch (ex: any) {
		logger(colors.red(`checkTx provide.getTransaction(${txHash}) Error`),ex.message)
		return false
	}
	
}

export const CONET_guardian_Address = (networkName: string) => {
	switch (networkName) {
		
		case 'usdt':
		//case 'eth':
			{
				return '0x1C9f72188B461A1Bd6125D38A3E04CF238f6478f'.toLowerCase()
			}
		case 'wusdt': 
		//case 'wbnb': 
			{
				return '0xeabF22542500f650A9ADd2ea1DC53f158b1fFf73'.toLowerCase()
			}
		//		CONET holesky
		// case 'dWETH':
		// case 'dWBNB':
		// case 'dUSDT':
		// case '':
		//		blast mainnet
		case 'usdb':
		// case 'blastETH':
		{
			return `0x4A8E5dF9F1B2014F7068711D32BA72bEb3482686`.toLowerCase()
		}
		default: {
			return ''
		}
	}
}

export const getAssetERC20Address = (assetName: string) => {
	switch (assetName) {
		
		case 'usdt':{
			return usdtETHContract.toLowerCase()
		}
		case 'wusdt':{
			return bnb_usdt_contract.toLowerCase()
		}
		case 'usdb': {
			return blast_usdb_contract.toLowerCase()
		}

		case 'CNTP': {
			return CNTPV2_Contract_Blast
		}

		// case 'dWBNB': {
		// 	return conet_dWBNB.toLowerCase()
		// }

		// case 'dUSDT': {
		// 	return conet_dUSDT.toLowerCase()
		// }

		// case 'dWETH': {
		// 	return conet_dWETH.toLowerCase()
		// }
	
		default: {
			return ``
		}
	}
}

const parseEther = (ether: string, tokenName: string ) => {
	switch (tokenName) {
		case 'usdt': {
			return ethers.parseUnits(ether, 6)
		}
		default: {
			return ethers.parseEther(ether)
		}
	}
}


export const checkErc20Tx = (tx: ethers.TransactionReceipt, receiveWallet: string, fromWallet: string, value: string, nodes: number, assetName: string) => {
	const total = parseEther((nodes * 1250).toString(), assetName).toString()
	if (total !== value) {
		return false
	}
	const txLogs = tx.logs[0]
	if (!txLogs) {
		logger(colors.red(`checkErc20Tx txLogs empty Error!`))
		return false
	}
	
	const iface = new ethers.Interface(CONET_Point_ABI)
	
	let uuu
	try {
		uuu = iface.parseLog(txLogs)
	} catch (ex) {
		logger(colors.red(`checkErc20Tx iface.parseLog(txLogs) ex Error!`))
		return false
	}
	if (uuu?.name !== 'Transfer') {
		logger(colors.red(`checkErc20Tx txLogs name [${uuu?.name}] !== 'Transfer' Error!`))
		return false
	}

	const receive = uuu.args[1].toLowerCase()
	const from = uuu.args[0].toLowerCase()
	if (from !== fromWallet || receive !== receiveWallet) {
		logger(colors.red(`checkErc20Tx from [${from}] !==[${from !== fromWallet}] fromWallet [${fromWallet}] receive [${receive}] !== [${receive !== receiveWallet}] receiveWallet [${receiveWallet}]`))
		return false
	}
	if (value !== uuu.args[2].toString()) {
		logger(colors.red(`checkErc20Tx value [${value}] !== uuu.args[2] [${uuu.args[2].toString()}] Error!`))
		return false
	}
	return true
}

const GuardianPlanPrice = 1250

const getAmountOfNodes: (nodes: number, assetName: string) => Promise<number> = (nodes, assetName) => new Promise(async resolve => {
	const assetPrice = await getOraclePrice ()
	if (typeof assetPrice === 'boolean') {
		return resolve(0)
	}
	const totalUsdt = nodes * GuardianPlanPrice
	const asssetSymbol = new RegExp (/usd/i.test(assetName) ? 'usd' : /bnb/i.test(assetName) ? 'bnb' : 'eth', 'i')
	const index = assetPrice.findIndex(n => {	
		asssetSymbol.test(n?.currency_name)
	})
	if (index < 0) {
		return resolve(totalUsdt)
	}
	const rate = parseFloat(assetPrice[index].usd_price)
	return resolve (totalUsdt/rate)
})

export const checkValueOfGuardianPlan = async (nodes: number, tokenName: string, paymentValue: string) => {

	const totalAmount = await getAmountOfNodes(nodes, tokenName)
	if (!totalAmount) {
		return false
	}
	const _total = parseFloat(ethers.formatEther(paymentValue))
	if (_total - totalAmount > totalAmount * 0.01) {
		return false
	}
	return true
}


export const checkReferralsV2_OnCONET_Holesky = async (wallet: string) => {
	const provider = new ethers.JsonRpcProvider(conet_Holesky_rpc)
	const contract = new ethers.Contract(conet_Referral_contractv3, CONET_Referral_blast_v2, provider)
	let uu
	try {
		uu = await contract.getReferrer(wallet)

	} catch (ex) {
		logger(colors.red(`checkReferralsV2_OnCONET_Holesky contract.getReferrer(${wallet}) Error!`), ex)
		return ('')
	}
	if (uu !== ethers.getAddress('0x0000000000000000000000000000000000000000')) {
		return (uu.toLowerCase())
	}
	return ''
	
}
// const Claimable_BlastETH = '0x47A10d4BBF904BCd550200CcBB6266fB88EB9804'.toLowerCase()
// const Claimable_BNB = '0x8E7B1D5f6DF4B0d7576B7430ECB1bEEE0b612382'.toLowerCase()
// const Claimable_ETH = '0x6Eb683B666310cC4E08f32896ad620E5F204c8f8'.toLowerCase()


const Claimable_ETHUSDT_old = '0x95A9d14fC824e037B29F1Fdae8EE3D9369B13915'.toLowerCase()
const Claimable_BNBUSDT_old = '0xC06D98B3185D3de0dF02b8a7AfD1fF9cB3c9399a'.toLowerCase()
const Claimable_BlastUSDB_old = '0x53Aee1f4c9b0ff76781eFAC6e20eAe4561e29E8A'.toLowerCase()


const Claimable_ETHUSDT_v3 = '0xfE75074C273b5e33Fe268B1d5AC700d5b715DA2f'.toLowerCase()
const Claimable_BNBUSDT_v3 = '0xAE752B49385812AF323240b26A49070bB839b10D'.toLowerCase()
const Claimable_BlastUSDB_v3 = '0x3258e9631ca4992F6674b114bd17c83CA30F734B'.toLowerCase()

const CNTPV2_Contract_Blast = '0x0f43685B2cB08b9FB8Ca1D981fF078C22Fec84c5'


export const getNetworkName = (tokenName: string) => {
	switch(tokenName) {
		case 'conet':
		case 'dWETH':
		case 'dWBNB':
		case 'dUSDT': {
			return `CONET Holesky`
		}
		
		case 'eth':
		case 'usdt':{
			return `Ethereum`
		}

		case 'blastETH':
		case 'usdb': {
			return 'Blast'
		}
		
		case 'wusdt':
		case 'bnb': {
			return 'BNB'
		}

		default : {
			return ''
		}
	}
}

export const realToClaimableContractAddress = (tokenName: string) => {
	switch(tokenName) {
		//case 'dUSDT':
		case 'usdt':{
			return Claimable_ETHUSDT_v3
		}
		case 'wusdt':{
			return Claimable_BNBUSDT_v3
		}
		case 'usdb': {
			return Claimable_BlastUSDB_v3
		}
		
		
		// case 'blastETH': {
		// 	return Claimable_BlastETH.toLowerCase()
		// }
		// case 'conet':
		// case 'dWETH':
		// case 'eth': {
		// 	return Claimable_ETH.toLowerCase()
		// }
		// case 'dWBNB':
		// case 'bnb': {
		// 	return Claimable_BNB.toLowerCase()
		// }

		default : {
			return ''
		}
	}
}


const getCONETHoleskyClaimableRealTokenName = (tokenName: string) => {
	switch(tokenName) {

		case 'cCNTP':{
			return 'CNTP'
		}
		case 'cUSDB':{
			return 'usdb'
		}
		case 'cUSDT': {
			return 'usdt'
		}
		case 'cBNBUSDT': {
			return 'wusdt'
		}
		default : {
			return ''
		}
	}
}

const getCONETHoleskyClaimableContractAddress = (tokenName: string) => {
	switch(tokenName) {

		// case 'cCNTP':{
		// 	return cCNTP_Contract
		// }
		case 'cUSDB':{
			return Claimable_BlastUSDB_v3
		}
		case 'cUSDT': {
			return Claimable_ETHUSDT_v3
		}
		case 'cBNBUSDT': {
			return Claimable_BNBUSDT_v3
		}
		default : {
			return ''
		}
	}
}

export const sendClaimableAsset = async (privateKey: string, retClaimableContractAddress: string, toAddr: string, amount: string) => new Promise(resolve => {

	const trySend = async () => {
		const provider = new ethers.JsonRpcProvider(conet_Holesky_rpc)
		const wallet = new ethers.Wallet(privateKey, provider)
		const claimableContract = new ethers.Contract(retClaimableContractAddress, claimableToken, wallet)

		try{
			const tx = await claimableContract.mint(toAddr, ethers.parseEther(amount))
			logger(colors.blue(`sendClaimableAsset ${claimableContract.target} amount [${amount}] success! ${tx.hash}`))
			resolve(tx)
		} catch (ex) {
			logger(colors.red(`sendClaimableAsset [${toAddr}] amount [${amount}] Error! try again!`))
			setTimeout(async () => {
				return await trySend()
			}, 2000)
		}
		
	}
	trySend()
})


const getReferralNode = async (contract: ethers.Contract, referrerAddr: string, tokenID: number) => {
	let nodes
	try {
		nodes = await contract.balanceOf(referrerAddr, tokenID)
	} catch(ex){
		return false
	}
	return nodes
}

const sendGuardianNodesContract = async (privateKey: string, nodeAddr: string[], paymentWallet: string) => new Promise(async resolve =>{
	const tryConnect = async () => {
		const provider = new ethers.JsonRpcProvider(conet_Holesky_rpc)
		const wallet = new ethers.Wallet(privateKey, provider)
		const GuardianNodesContract = new ethers.Contract(GuardianNodes_ContractV3, GuardianNodesV2ABI, wallet)
		
		try{
			const tx = await GuardianNodesContract.mint(nodeAddr, paymentWallet)
			resolve (tx)
		} catch (ex) {
			logger(colors.red(`returnGuardianPlanReferral call GuardianNodesContract.mint Error! Try Again`))
			setTimeout(async () => {
				return await tryConnect()
			}, 5000)
		}
		
	}
	tryConnect()
	
})

export const returnGuardianPlanReferral = async (nodes: number, referrerAddress: string, paymentWallet: string, tokenName: string, privateKey: string, nodeAddr: string[]) => {
	const retClaimableContractAddress = realToClaimableContractAddress(tokenName)
	
	if (!retClaimableContractAddress) {
		logger(colors.red(`returnGuardianPlanReferral getClaimableContractAddress tokenName =(${tokenName}) return Empty ERROR`))
		return false
	}

	const provider = new ethers.JsonRpcProvider(conet_Holesky_rpc)
	const wallet = new ethers.Wallet(privateKey, provider)
	const GuardianNodesContract = new ethers.Contract(GuardianNodes_ContractV3, GuardianNodesV2ABI, wallet)

	const [bayerOwnNodes, referrerHasNodes] = await Promise.all ([
		getReferralNode (GuardianNodesContract, paymentWallet, 1),
		getReferralNode (GuardianNodesContract, referrerAddress, 1)
	])

	const _amount = nodes * 1250 * 0.1
	const eachNodeReferral = _amount/nodes

	const referrerReturn = bayerOwnNodes > 0 ? 0 : referrerHasNodes ? eachNodeReferral : 0
	const paymentReferrerReturn = _amount - referrerReturn
	
	const ret: any = {
		claimableAssetTx: null,
		guardianNodesTx: null
	}

	if (referrerReturn > 0) {
		await sendClaimableAsset (privateKey, retClaimableContractAddress, referrerAddress, referrerReturn.toFixed(8))
	}

	if (paymentReferrerReturn > 0) {
		ret.claimableAssetTx = await sendClaimableAsset (privateKey, retClaimableContractAddress, paymentWallet, paymentReferrerReturn.toFixed(8))
	}
	
	ret.guardianNodesTx = await sendGuardianNodesContract(privateKey, nodeAddr, paymentWallet)

	transferCCNTP(nodeAddr, '20000', () => {
		return logger(colors.blue(`transferCCNTP GuardianNodes ${inspect(nodeAddr, false, 3, true)} each 20000 success!`))
	})

	return (ret)

}

export const transferCCNTP = (walletList: string[], amount: string, callback: () => void) => {
	if (walletList.length < 1) {
		return callback ()
	}
	const provider = new ethers.JsonRpcProvider(conet_Holesky_rpc)
	const wallet = new ethers.Wallet(masterSetup.claimableAdmin, provider)
	const cCNTPContract = new ethers.Contract(cCNTP_Contract, CONET_Point_ABI, wallet)

	const send: any = async () => {
		const paymentList = walletList.map(n => ethers.parseEther(amount))
		let tx
		try {
			tx = await cCNTPContract.multiTransferToken(walletList, paymentList)
		} catch (ex) {
			logger(colors.red(`transferCCNTP Error! = [${walletList.length}]`))
			return setTimeout(() => {
				return send()
			}, 1000)
		}
		logger (colors.magenta(`transferCCNTP [${walletList.length}] amount[${amount}] success! ${tx.hash}`))
		callback()
	}
	send()
}


const checkWalletLastEvent = async (contract: ethers.Contract, wallet: string) => {
	let events
	try {
		events = await contract.filters.Transfer(null, wallet)
	} catch (ex: any) {
		logger(colors.red(`checkWalletLastEvent ex error! [${ex.message}]`))
	}
	logger(events)
	
}

const convertWeiToEthWithDecimal = (value: string, tokenName: string) => {
	switch(tokenName) {
		case 'usdt':
			{
				return ethers.formatUnits(value, 6)
			}
		default:
			{
				return ethers.formatUnits(value, 18)
			}

	}
}

export const checkClaimeToeknbalance = async (wallet: string, claimeTokenName: string) => {
	
	const smartContractAddress = getCONETHoleskyClaimableContractAddress(claimeTokenName)
	if (!smartContractAddress) {
		return false
	}
	const provide = new ethers.JsonRpcProvider(conet_Holesky_rpc)
	const claimableAdmin = new ethers.Wallet(masterSetup.claimableAdmin, provide)
	const claimableContract = new ethers.Contract(smartContractAddress, claimableToken, claimableAdmin)
	let balance = ''
	
	try {
		balance = (await claimableContract.balanceOf(wallet)).toString()
	} catch (ex: any) {
		logger(colors.red(`checkClaimeToeknbalance getBalance error [${ex.message}]`) )
		return false
	}

	if (!balance || balance === '0') {
		return false
	}

	const realTokenName = getCONETHoleskyClaimableRealTokenName(claimeTokenName)
	if (!realTokenName) {
		return false
	}
	const realRPC = getNetwork(realTokenName)
	const sc1 = getAssetERC20Address(realTokenName)
	if (!sc1) {
		return false
	}

	const provideReal = new ethers.JsonRpcProvider(realRPC)
	const sendAdmin = new ethers.Wallet(masterSetup.conetPointAdmin, provideReal)
	const sc1d = new ethers.Contract(sc1, erc20TokenABI, sendAdmin)

	//const lastuu = checkWalletLastEvent(sc1d, wallet)

	let sendWalletBalance
	try {
		sendWalletBalance = await sc1d.balanceOf(sendAdmin.address.toLowerCase())
	} catch (ex:any) {
		logger(colors.red(`checkClaimeToeknbalance check sendWalletBalance error [${ex.message}]`) )
		return false
	}
	const requestBalance = parseFloat(ethers.formatEther(balance))
	const masterBalance = parseFloat(convertWeiToEthWithDecimal(sendWalletBalance.toString(), realTokenName).toString())
	if (masterBalance - requestBalance <= 0) {
		logger(colors.red(`checkClaimeToeknbalance conetPointAdmin balance [${ masterBalance }] LESS ERROR`))
		return false
	}
	const requestAmount = parseEther(requestBalance.toString(), realTokenName)
	try {
		const tx1 = await claimableContract.burnFrom(wallet, balance)
		logger(inspect(tx1, false, 3, true))
		
	} catch (ex: any) {
		logger(colors.red(`checkClaimeToeknbalance claimableContract.burnFrom||sc1d.transfer ERROR!`), ex.message)
		return false
	}
	try {
		const tx2 = await sc1d.transfer(wallet, requestAmount)
		logger(colors.magenta(`checkClaimeToeknbalance success transfer ${requestAmount} to ${wallet}`), inspect(tx2, false, 3, true))
	} catch (ex: any) {
		logger(colors.red(`checkClaimeToeknbalance sc1d.transfer ERROR!`), ex.message)
		return false
	}
	
	return true
}




const walletListPassed: string[] = [
	'0x28B2aE27e135E89D9BcB40595F859b411bF4846C',
	'0x7619FC557e3575Ac1bA1C0D99307ac1E487FC83e',
	'0x9824fdF7BDE5821E5D5ba43daA1615f9C980F3Ce',
	'0x314b5579a3Aa1F91333aed3392C3AD2d1FFF3714',
	'0x13C933D953DF0449dcBbF26f088a5453FA5a536d',
	'0x2B28eB6E3D06e49dAf4FAf5DB36Ef2365b783198',

	'0x35a7fb2fB923d3329988762093Ed664320b12718',
	'0x51Bbe99e4d2c60916befeb038CE07f7B9123Bf47',
	'0x4a525bE5520c6d4673Fc357fb278Ef1C51c1BDAF',
	'0xfe921582775A66487e717BAcad401F55684986b1',
	'0x4C736f1B298947Ad73B4c87a9206b476CCB770B4',
	'0xdEA83858Deda2708937E1309fDD96A94673EcBe6',
	// '0x41EBF19F419470d7564078e40d569C5AF7baA313',
	// '0x2664A57d0F6C54D9Fe2557E71aE2f45447F2567b',
	// '0x0c39Fbd31F78CF301E7Ca05e50EDA2745782CF27',
	// '0x01f28942A609Bf3e5043919148C4E6603a349118'
]
//    https://scan.conet.network/tx/0x632dec9e279dcac4249d1135bb2c9eb0ff489c029c815b41b324f2ce68d102bb
const walletList20FromMari20240518: string[] = [
	'0x11e8F3EE1c82Eb72956af348744097ED7150798C',
	'0xB9ECDB21fc60044A9711e2bEB89ddAD272B084b3',
	'0x00E527dF113970e188994e16aa7D0ac170c24064',
	'0x18E976929b107028F03A3134a87A87B3c1D3f415',
	'0x97C2173fbd2CC9A233D174F3546D719D41c0e572',
	'0xCc0EA05cC3aac1EDFF96F8E06aB17D7E7055dD45',
	'0x2bD91A61eBFc3cd6d749D0702EB5F248F6490fE9',
	'0x181AEc6cBFE36eb2CF0363541C47DAa5a0E3de42',
	'0x778dBb5eD8583aCF006882c6DC133d717DD98b6a',
	'0x9396805563a7dF2b1f5A2Cd717F7BC095490a8c6',
	'0x3d09621Bb919044dAe41bf1790e14e44339629aE',
	'0x5edE92F6334bC8C2BEcb97054CfE1955D8E7E877',
	'0xFb45baA07537e2c5E5730D5A4313d34Ec2e8deae',
	'0xCf140EfA70f2722AF882A3591318299fa88FD1fE',
	'0xd0CFD889f276f0C190b9d109d00A15C643E1Caba',
	'0xCa992554CfB3CD9Fe1Ab9E3B529574Ac93927379',
	'0x4C5207F5FCE86534D8DA3b98e1ddEfEBA0B38f8e',
	'0x765A908Edd3216a35112F8f02071C9D1a92Bcb67',
	'0x737CbA3844f1D76Cc8BE0Ca62eD4B34e914B90CB',
	'0xc971c589B0210B9d93e50F054eD9987001E21eF2'
]
//    https://scan1.conet.network/tx/0xf2e277deed0bcabccab20722a7a8a24b5faab1314aa08b758f6ba9878e31acbe
const walletyoutubeFromMari20240526: string[] = [
	'0xBd0c11A07A55378e90FCC00da49E663D6E1Ee896',
	'0x43ff8Dda6812145846399BA32D354ac88a0AE592',
	'0x9d0cAf70b882033509702185D3e2DDfBB07dfeBc',
	'0xfB0467152527e766565eEf67c8F746E2220bFEeb',
	'0xFF10899a9372D5C5E54bf5212caF486eBA6efA2A',
	'0xC43Fc8E2d0Ac5eE20620460F9Cba0F081c6C920A',
	'0xCf140EfA70f2722AF882A3591318299fa88FD1fE',
	'0x74d8b2306Ec433aa255660752D9E1FDe5FDc1323',
	'0xCE0d514B464fD5555081cE4Bd71Ce90ed79f0Ed2',
	'0xd1a5ACC6474d6AEfEd25f79aE21fEFBb3f186CA9'
]

//    https://scan.conet.network/tx/0xe1d02f95de54e9ff3fc05021a839d1e4035324d8e6ca332369955a020e37e39d
const walletNodes20240526: string[] = [
	'0xD4e684B824004821870441dD41a649581272f5f7'
]


const burnFrom = async (claimeTokenName: string, wallet: string, _balance: string) => {
	const balance = ethers.parseEther(_balance)
	const smartContractAddress = getCONETHoleskyClaimableContractAddress(claimeTokenName)
	if (!smartContractAddress) {
		return false
	}
	const provide = new ethers.JsonRpcProvider(conet_Holesky_rpc)
	const claimableAdmin = new ethers.Wallet(masterSetup.conetFaucetAdmin[0], provide)
	const claimableContract = new ethers.Contract(smartContractAddress, claimableToken, claimableAdmin)
	try {
		const tx1 = await claimableContract.burnFrom(wallet, balance)
		logger(inspect(tx1, false, 3, true))
		
	} catch (ex: any) {
		logger(colors.red(`checkClaimeToeknbalance claimableContract.burnFrom||sc1d.transfer ERROR!`), ex.message)
		return false
	}

}

// const test1 = async () => {
// 	const privateKey = masterSetup.conetFaucetAdmin[0]

// 	const provider = new ethers.JsonRpcProvider(conet_Holesky_rpc)
// 	const wallet = new ethers.Wallet(privateKey, provider)
// 	const GuardianNodesContract = new ethers.Contract(GuardianNodes_ContractV3, GuardianNodesV2ABI, wallet)

// 	const paymentWallet = '0x3Fe974097894aD1392A3A48e337b288EA7B79275'
// 	const referrerAddress = '0x9BDcDd34260f48b2fed4Dd396c83cFE6F3bfE686'
// 	const [bayerOwnNodes, referrerHasNodes] = await Promise.all ([
// 		getReferralNode (GuardianNodesContract, paymentWallet, 1),
// 		getReferralNode (GuardianNodesContract, referrerAddress, 1)
// 	])

// 	logger(inspect(bayerOwnNodes), inspect(referrerHasNodes ? true : false))
// }

// const test = async () => {
// 	const privateKey = masterSetup.conetFaucetAdmin[0]

// 	const provider = new ethers.JsonRpcProvider(conet_Holesky_rpc)
// 	const wallet = new ethers.Wallet(privateKey, provider)
// 	const GuardianNodesContract = new ethers.Contract(GuardianNodes_ContractV3, GuardianNodesV2ABI, wallet)

// 	const paymentWallet = '0x55D39f7397F2c1f5faDb3829F5CDb8aCcc107799'
// 	const referrerAddress = '0xE482da05cB82d2b996780Db17D8B916356E1323d'
// 	const [bayerOwnNodes, referrerHasNodes] = await Promise.all ([
// 		getReferralNode (GuardianNodesContract, paymentWallet, 1),
// 		getReferralNode (GuardianNodesContract, referrerAddress, 1)
// 	])

// 	logger(inspect(bayerOwnNodes), inspect(referrerHasNodes ? true : false))
// }

// const wallet = new ethers.Wallet(masterSetup.claimableAdmin)
// logger(wallet.address)
// transferCCNTPToNodes(walletList, '5000', () => {
// 	logger('success')
// })


//transCleamableToken('wusdt', '0xD8b12054612119e9E45d5Deef40EDca38d54D3b5', '125')
// nodesAirdrop()

// nodesReferrals()

// test()


// nodesAirdrop()
// transNFT()
// transferCCNTP(nodesWalletAddr, '0.0001', () => {
// 	logger('success!')
// })

// tetsGet()
// const transfer = async () => {
// 	// const reciver = '0x8ab7B4BfE50738a8793735E7EB6948a0c7BAC9Ee'
// 	// await sendClaimableAsset (masterSetup.claimableAdmin,Claimable_ETHUSDT, reciver, '375')
// }

// transfer()
//GuardianPlanPreCheck()
//const [,,...args] = process.argv
//logger(getRefferRate(parseInt(args[0])))
// test()


// test()
//listenEvent()

// transferCCNTPToNodes(walletNodes20240526, '20000', () => {
// 	logger(`success`)
// })



/** */

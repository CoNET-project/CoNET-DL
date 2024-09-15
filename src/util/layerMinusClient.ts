//	gossip for mining

import {ethers} from 'ethers'
import Colors from 'colors/safe'
import {logger} from './logger'
import {inspect} from 'node:util'
import {RequestOptions, request } from 'node:http'
import {createMessage, encrypt, enums, readKey, Key} from 'openpgp'
import GuardianNodesV2ABI from '../endpoint/CGPNsV7.json'

type nodes_info = {
	country?: string
	customs_review_total?: number
	ip_addr: string
	last_online?: boolean
	lat?: number
	lon?: number
	outbound_total?: number
	region: string
	armoredPublicKey: string
	publicKeyObj?: Key
	domain?: string
}

const conet_rpc = 'https://rpc.conet.network'
const GuardianNFT = '0x35c6f84C5337e110C9190A5efbaC8B850E960384'
const GuardianNodesInfoV6 = '0x9e213e8B155eF24B466eFC09Bcde706ED23C537a'

const provoder = new ethers.JsonRpcProvider(conet_rpc)

const startGossip = (url: string, POST: string, callback: (err?: string, data?: string) => void) => {
	const Url = new URL(url)

	const option: RequestOptions = {
		hostname: Url.hostname,
		port: 80,
		method: 'POST',
		protocol: 'http:',
		headers: {
			'Content-Type': 'application/json;charset=UTF-8'
		},
		path: Url.pathname
	}

	let first = true
	logger(inspect(option, false, 3, true))
	const kkk = request(option, res => {

		if (res.statusCode !==200) {
			return logger(`startTestMiner got res.statusCode = [${res.statusCode}] != 200 error! restart`)
		}

		let data = ''
		let _Time: NodeJS.Timeout

		res.on ('data', _data => {

			data += _data.toString()
			
			if (/\r\n\r\n/.test(data)) {
				clearTimeout(_Time)
				if (first) {
					first = false
					
				}
				callback ('', data)
				data = ''
				_Time = setTimeout(() => {
					logger(Colors.red(`startGossip [${url}] has 2 EPOCH got NONE Gossip Error! Try to restart! `))
					return startGossip (url, POST, callback)
				}, 24 * 1000)
			}
		})

		res.once('error', err => {
			kkk.destroy()
			logger(Colors.red(`startGossip [${url}] res on ERROR! Try to restart! `), err.message)
			return startGossip (url, POST, callback)
		})

		res.once('end', () => {
			kkk.destroy()
			logger(Colors.red(`startGossip [${url}] res on END! Try to restart! `))
			return startGossip (url, POST, callback)
		})
		
	})

	// kkk.on('error', err => {
	// 	kkk.destroy()
	// 	logger(Colors.red(`startGossip [${url}] requestHttps on Error! Try to restart! `), err.message)
	// 	return startGossip (url, POST, callback)
	// })

	kkk.end(POST)

}

const connectToGossipNode = async (privateKey: string, node: nodes_info ) => {
	
	const wallet = new ethers.Wallet(privateKey)
	const command = {
		command: 'mining_gossip',
		walletAddress: wallet.address.toLowerCase()
	}
	
	const message =JSON.stringify(command)
	const signMessage = await wallet.signMessage(message)
	const encryptObj = {
        message: await createMessage({text: Buffer.from(JSON.stringify ({message, signMessage})).toString('base64')}),
		encryptionKeys: node.publicKeyObj,
		config: { preferredCompressionAlgorithm: enums.compression.zlib } 		// compress the data with zlib
    }

	const postData = await encrypt (encryptObj)

	startGossip(`https://${node.domain}/post`, JSON.stringify({data: postData}), (err, data ) => {
		logger(Colors.magenta(`${node.domain} => \n${data}`))
	})
}

let currentEpoch = 0
const listenEpoch = async () => {
	currentEpoch = await provoder.getBlockNumber()

	provoder.on('block', block => {
		currentEpoch = block
		logger(Colors.blue(`listenEpoch on [${currentEpoch}]`))
	})
	logger(Colors.blue(`listenEpoch start current = [${currentEpoch}]`))
}
let getNodeInfoProssing = false

const guardianSmartContract = new ethers.Contract(GuardianNFT, GuardianNodesV2ABI, provoder)//
//const GuardianNodesInfoV3Contract = new ethers.Contract(GuardianNodesInfoV6, openPGPContractAbi, CONETProvider)
const getAllNodes = () => {
	if (getNodeInfoProssing) {
		return logger(`initGuardianNodes already running!`)
	}
	getNodeInfoProssing = true

}
const start = async () => {
	const acc = ethers.Wallet.createRandom()
	
	const node1_key = 'LS0tLS1CRUdJTiBQR1AgUFVCTElDIEtFWSBCTE9DSy0tLS0tCgp4ak1FWnEybStCWUpLd1lCQkFIYVJ3OEJBUWRBaGFoVkZ4SHd2bDcyb25DOEZWa1ZlcnYvWmJDSnVFRjUKOXBDWnlIS09hREhOS2pCNFlrVTVNMFF4TldWRU1qVTFPVEUwT0RnME1XUXhRamsyWVdObU16ZENZVVl5Cll6WTVOa1l5WXNLTUJCQVdDZ0ErQllKbXJhYjRCQXNKQndnSmtNQlBRM3lGQ1BvYUF4VUlDZ1FXQUFJQgpBaGtCQXBzREFoNEJGaUVFblpobVJ1cnBGaUt5MXhNNndFOURmSVVJK2hvQUFCSW9BUDk4ZzIxd0NQOHYKL01UR1BpUUV2S3dJN3lOcVl1RWlOeGltcWhCaENXZVM5QUQrS2VmV0ZsZk05ejA5b2ZkYmtiNzRHZVJkCnFlTVEwSkNwU1ZZZEpLd3JLQWZPT0FSbXJhYjRFZ29yQmdFRUFaZFZBUVVCQVFkQWdwSUUyNERDYU5JMApkUjFuUmlISEVYMzBoSXVYYjdKUXFwTzhtcGNiT0FvREFRZ0h3bmdFR0JZS0FDb0ZnbWF0cHZnSmtNQlAKUTN5RkNQb2FBcHNNRmlFRW5aaG1SdXJwRmlLeTF4TTZ3RTlEZklVSStob0FBTlhlQVFDLzJhdnBqTGhMCkluRTdTV09mVXJkcVVtSEJMYTBvVnFINUtvK3NnSEdydVFEL1ZQYUlRQVBoT0E1a3BGbTNOYXJkZGhheApINmZHTnpzc1A5cnRiNmQ5QVFvPQo9Ui9FTwotLS0tLUVORCBQR1AgUFVCTElDIEtFWSBCTE9DSy0tLS0tCg=='
	const pgpKeyArmore1 = Buffer.from(node1_key, 'base64').toString()
	const pgpKey1 = await readKey({ armoredKey: pgpKeyArmore1})
	const pgpKeyID1 = pgpKey1.getKeyIDs()[1].toHex().toUpperCase()
	const node1: nodes_info = {
		armoredPublicKey: pgpKeyArmore1,
		ip_addr: '194.164.91.8',
		publicKeyObj: pgpKey1,
		region: 'US',
		domain: `${pgpKeyID1}.conet.network`
	}


	const node_key = `LS0tLS1CRUdJTiBQR1AgUFVCTElDIEtFWSBCTE9DSy0tLS0tCgp4ak1FWnRRQ0xoWUpLd1lCQkFIYVJ3OEJBUWRBc1lWSXQrdzB2WGlycGFPeXMvMVEyeHY4aVN0L2lkcUsKTUtxbVRtd1ZpeWJOS2pCNE16WkNNVGsxTlRBNFpESTVNVU5EWWpneE9UVTROelV4TmpSQ056VTROamhpCk9Ua3lOalEwUk1LTUJCQVdDZ0ErQllKbTFBSXVCQXNKQndnSmtBN3dnUCtsZkd2aUF4VUlDZ1FXQUFJQgpBaGtCQXBzREFoNEJGaUVFVEZwVDNyT1IzdmJvN1ZPNkR2Q0EvNlY4YStJQUFHRVBBUDkvdDlPYUJTS2QKQm5vb3F2cDBOYldoWEorRERKMFZnMDBzT1BDc2c1STQrZ0Q5R21WTGEwdkRMSWJxVXIyWXVuSkpCYzBZCjBKWDZJRWxwc1UvTHo2R29oZ0RPT0FSbTFBSXVFZ29yQmdFRUFaZFZBUVVCQVFkQTRwRC9lS2ZmU3dRTApGbXZJNzZwWlJwNkZSbmZROGdrSXR1a2p5V0x1eFRzREFRZ0h3bmdFR0JZS0FDb0ZnbWJVQWk0SmtBN3cKZ1ArbGZHdmlBcHNNRmlFRVRGcFQzck9SM3ZibzdWTzZEdkNBLzZWOGErSUFBS1ZMQVB3TXBWVnJjSEViCnROZ2tIZW90d2krMVBlaW9vUGpERE5LaWRZaHB1V01BUVFEK1AxTjgwbVM5b3pxanE5c0ZBSkFxaEZ1QQpGRUt3amRxQmpiYzhKMVdPandVPQo9aThtRwotLS0tLUVORCBQR1AgUFVCTElDIEtFWSBCTE9DSy0tLS0tCg==`
	const pgpKeyArmore = Buffer.from(node_key, 'base64').toString()
	const pgpKey = await readKey({ armoredKey: pgpKeyArmore})
	const pgpKeyID = pgpKey.getKeyIDs()[1].toHex().toUpperCase()
	const node0: nodes_info = {
		armoredPublicKey: pgpKeyArmore,
		ip_addr: '209.209.10.187',
		publicKeyObj: pgpKey,
		region: 'US',
		domain: `${pgpKeyID}.conet.network`
	}
	connectToGossipNode(acc.signingKey.privateKey, node0)
	connectToGossipNode(acc.signingKey.privateKey, node1)
	listenEpoch()
}

start()
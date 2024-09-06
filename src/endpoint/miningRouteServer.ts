//	forward mining to nodes

import {logger} from '../util/logger'
import {ethers} from 'ethers'
import Colors from 'colors/safe'
import GuardianNodesV2ABI from './CGPNsV7.json'
import GuardianNodesInfoABI from './CONET_nodeInfo.ABI.json'
import {inspect} from 'node:util'
import {mapLimit} from 'async'
import { masterSetup} from '../util/util'
import {exec} from 'child_process'
import { generateKey, readKey, readPrivateKey, decryptKey, createCleartextMessage, sign as pgpSign, readMessage, decrypt, encrypt, createMessage, enums } from "openpgp"

const CONETProvider = new ethers.JsonRpcProvider('https://rpc.conet.network')
const GuardianNFT = '0x35c6f84C5337e110C9190A5efbaC8B850E960384'
const GuardianNodesInfoV6 = '0x9e213e8B155eF24B466eFC09Bcde706ED23C537a'
const GuardianNodesInfoV3Contract = new ethers.Contract(GuardianNodesInfoV6, GuardianNodesInfoABI, CONETProvider)

let getNodeInfoProssing = false
export const routerInfoWithWallet: Map<string, nodeInfo> = new Map()
export const routerInfoWithID: Map<number, nodeInfo> = new Map()
export const routerInfoWithPGPKey: Map<string, nodeInfo> = new Map()

const getNodeInfo = async (nodeID: number) => {

	logger(Colors.gray(`getNodeInfo [${nodeID}]`))
	const nodeInfo = {
		ipaddress: '',
		regionName: '',
		pgpArmored: '',
		pgpKeyID: ''
	}

	const [ipaddress, regionName, pgp] = await GuardianNodesInfoV3Contract.getNodeInfoById(nodeID)
	
	if (ipaddress) {
		
		nodeInfo.ipaddress = ipaddress
		nodeInfo.regionName = regionName
		nodeInfo.pgpArmored = pgp
		return nodeInfo
		
	}
	logger(inspect(ipaddress, regionName, pgp))
	return null
}

const getDNS = () => {
	const cmd = `curl -X GET "https://api.cloudflare.com/client/v4/zones/${masterSetup.cloudflare.zoneID}/dns_records/" ` +
				`-H "X-Auth-Email: ${masterSetup.cloudflare.X_Auth_Email}" ` + 
				`-H "X-Auth-Key: ${masterSetup.cloudflare.X_Auth_Key}" ` +
				`-H "Content-Type: application/json"`
	return cmd
}

const regiestDNS = (dns: string, ipaddress: string) => new Promise(resolve => {
	const cmd = `curl -X POST "https://api.cloudflare.com/client/v4/zones/${ masterSetup.cloudflare.zoneID }/dns_records/" ` +
	`-H "X-Auth-Email: ${ masterSetup.cloudflare.X_Auth_Email }" ` + 
	`-H "X-Auth-Key: ${ masterSetup.cloudflare.X_Auth_Key }" ` +
	`--data '{"type": "A", "name": "${dns}.conet.network", "content": "${ipaddress}", "proxied": true, "ttl": 1}'` +
	`-H "Content-Type: application/json"`
	exec(cmd, err => {
		resolve (true)
	})
})

const initGuardianNodes = async () => {
	if (getNodeInfoProssing) {
		return logger(`initGuardianNodes already running!`)
	}

	getNodeInfoProssing = true
	const guardianSmartContract = new ethers.Contract(GuardianNFT, GuardianNodesV2ABI, CONETProvider)

	let nodes
	try {
		nodes = await guardianSmartContract.getAllIdOwnershipAndBooster()
	} catch (ex: any) {
		getNodeInfoProssing = false
		return console.error(Colors.red(`guardianReferrals guardianSmartContract.getAllIdOwnershipAndBooster() Error!`), ex.mesage)
	}


	const _nodesAddress: string[] = nodes[0].map((n: string) => n)
	const nodeIDs: number[]= []
	for (let i = 100; i < nodes[0].length; i++) {
		nodeIDs.push(i)
	}

	return await mapLimit(nodeIDs, 1, async (n, next) => {
		
		const result = await getNodeInfo(n)
		const _node = _nodesAddress[n]
		if (result === null) {
			throw new Error('End of node info')
		}
		const armoredKey = Buffer.from(result.pgpArmored, 'base64').toString()
		const pgpKeyObj = await readKey({ armoredKey })
		const pgpKey =  pgpKeyObj.getKeyIDs()[1].toHex().toUpperCase()
		const node: nodeInfo = {
			wallet: _node.toLowerCase(),
			ipaddress: result.ipaddress,
			pgpKeyID: pgpKey,
			pgpArmored: armoredKey,
			regionName: result.regionName,
			nodeID: n
		}
		
		routerInfoWithWallet.set (_node, node)
		routerInfoWithID.set(n, node)
		routerInfoWithPGPKey.set(pgpKey, node)
		//await regiestDNS(node.pgpKeyID, node.ipaddress)

	}, err => {
		getNodeInfoProssing = false
		
	})
	
}
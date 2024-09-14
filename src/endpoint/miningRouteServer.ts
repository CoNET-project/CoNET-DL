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
interface dnsRecord {
	id: string										//		959a332aa50f7722e769202a50700dc6
	zone_id: string									//		8be0f80a319b369e917cf41af4b83ee9
	zone_name: string								//		conet.network
	name: string									//		f03acd5b5c25b7e3.conet.network
	type: string									//		A
	content: string									//		212.227.90.190
	proxiable: string								//		true
	proxied: string									//		false
	ttl: 1											//		1
	settings: {}									//		{}
	meta: {
		auto_added: boolean							//		false
		managed_by_apps: boolean					//		false
		managed_by_argo_tunnel: boolean				//		false
	}
	comment: ''										//		null
	tags: []										//		[]
	created_on: string								//		'2024-08-31T22:09:57.14881Z'
	modified_on: string								//		 '2024-09-06T14:24:24.001263Z'
}
let record: dnsRecord[] = []
const getDNS = () => new Promise((resolve,  reject )=> {
	const cmd = `curl -X GET "https://api.cloudflare.com/client/v4/zones/${masterSetup.cloudflare.zoneID}/dns_records?per_page=1000&page=1" ` +
				`-H "X-Auth-Email: ${masterSetup.cloudflare.X_Auth_Email}" ` + 
				`-H "X-Auth-Key: ${masterSetup.cloudflare.X_Auth_Key}" ` +
				`-H "Content-Type: application/json"`
		exec(cmd, (err, stdout, stderr) => {
		if (err) {
			return logger(err)
		}
		if (stdout) {
			try {
				const _record = JSON.parse(stdout)
				record = _record.result
				resolve(true)
			} catch (ex) {
				logger(Colors.red(`JSON.parse stdout Error!`))
				return reject()
			}
		}
	})
})

const deleteDns = (id: string) => new Promise(resolve => {
	
	const cmd = `curl --request DELETE "https://api.cloudflare.com/client/v4/zones/${ masterSetup.cloudflare.zoneID }/dns_records/${id}" ` +
		`-H "X-Auth-Email: ${ masterSetup.cloudflare.X_Auth_Email }" ` + 
		`-H "X-Auth-Key: ${ masterSetup.cloudflare.X_Auth_Key }" `
	logger(Colors.gray(`${cmd}`))
	exec(cmd, err => {
		resolve (true)
	})
})
const regiestDNS = (dns: string, ipaddress: string) => new Promise(async resolve => {
	const index = record.findIndex(n => n.name.split('.')[0] === dns.toLowerCase())
	if (index > 0) {
		const id = record[index].id
		await deleteDns(id)
	}
	
	const cmd = `curl -X POST "https://api.cloudflare.com/client/v4/zones/${ masterSetup.cloudflare.zoneID }/dns_records/" ` +
	`-H "X-Auth-Email: ${ masterSetup.cloudflare.X_Auth_Email }" ` + 
	`-H "X-Auth-Key: ${ masterSetup.cloudflare.X_Auth_Key }" ` +
	`--data '{"type": "A", "name": "${dns}.conet.network", "content": "${ipaddress}", "proxied": false, "proxiable": false, "ttl": 1}'` +
	`-H "Content-Type: application/json"`
	logger(Colors.gray(`${cmd}`))
	return exec(cmd, err => {
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
	await getDNS ()
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
		await regiestDNS(node.pgpKeyID, node.ipaddress)

	}, err => {
		getNodeInfoProssing = false
		
	})
	
}

initGuardianNodes()

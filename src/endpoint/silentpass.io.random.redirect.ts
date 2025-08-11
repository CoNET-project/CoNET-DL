import Express, { Router } from 'express'
import { logger } from '../util/util'
import Colors from 'colors/safe'
import {createServer} from 'node:http'
import type {Response, Request } from 'express'
import {ethers} from 'ethers'
import GuardianNodesV2ABI from './CGPNv7New.json'
import NodesInfoABI from './CONET_nodeInfo.ABI.json'
import {mapLimit} from 'async'
import {createMessage, encrypt, enums, readKey,generateKey, readPrivateKey, decryptKey} from 'openpgp'
import newNodeInfoABI from './newNodeInfoABI.json'
const getIpAddressFromForwardHeader = (req: Request) => {
    const ipaddress = req.headers['X-Real-IP'.toLowerCase()]
    if (!ipaddress||typeof ipaddress !== 'string') {
        return ''
    }
    return ipaddress
}

const CONET_Guardian_PlanV7 = '0x312c96DbcCF9aa277999b3a11b7ea6956DdF5c61'.toLowerCase()
const GuardianNodesInfoV6_cancun = '0x88cBCc093344F2e1A6c2790A537574949D711E9d'
const provider = new ethers.JsonRpcProvider('https://cancun-rpc.conet.network')
let Guardian_Nodes: nodeInfo[] = []

const CONET_MAINNET = new ethers.JsonRpcProvider('https://mainnet-rpc.conet.network') 
const GuardianNodeInfo_mainnet = '0x2DF3302d0c9aC19BE01Ee08ce3DDA841BdcF6F03'
const GuardianNodesMainnet = new ethers.Contract(GuardianNodeInfo_mainnet, newNodeInfoABI, CONET_MAINNET)
const getAllNodes = () => new Promise(async resolve=> {
    
    const _nodes = await GuardianNodesMainnet.getAllNodes(0, 1000)
    for (let i = 0; i < _nodes.length; i ++) {
        const node = _nodes[i]
        const id = parseInt(node[0].toString())
        const pgpString: string = Buffer.from( node[1], 'base64').toString()
        const domain: string = node[2]
        const ipAddr: string = node[3]
        const region: string = node[4]
        const itemNode: nodeInfo = {
            ip_addr: ipAddr,
            armoredPublicKey: pgpString,
            domain: domain,
            nftNumber: id,
            region: region
        }
    
        Guardian_Nodes.push(itemNode)
    }
    logger(Colors.red(`getAllNodes success, Guardian_Nodes = ${Guardian_Nodes.length} `))
    resolve(true)
})

const getRandomNode = () => {
    if (!Guardian_Nodes.length) {
        return null
    }
    const index = Math.floor(Math.random() * Guardian_Nodes.length)
    return Guardian_Nodes[index]
}


class conet_dl_server {

	private PORT = 4000
	private initSetupData = async () => {
		this.startServer()
	}

	constructor () {
		this.initSetupData ()
	}

	private startServer = async () => {
		
		const app = Express()
		const router = Router ()
		app.disable('x-powered-by')
        app.use((err: any, req: any, res: any, next: any) => {
            if (err) {
                console.error(err)
                return res.status(400).send({ status: 400, message: err.message }); // Bad request
            }
        })
		app.use(Express.json())

		app.once ( 'error', ( err: any ) => {
			/**
			 * https://stackoverflow.com/questions/60372618/nodejs-listen-eacces-permission-denied-0-0-0-080
			 * > sudo apt-get install libcap2-bin 
			 * > sudo setcap cap_net_bind_service=+ep `readlink -f \`which node\``
			 * 
			 */
			logger (err)
			logger (Colors.red(`Local server on ERROR`))
		})

		const server = createServer(app)

		app.all ('*', (req: any, res: any) => {
            
            let search = ''
            try {
                const url = new URL(req.url, `https://${req.headers.host}`)
                search = url.search
            } catch (ex) {
                logger(`URL parse error: ${ex}`)
            }

            logger(`url = ${req.url} Search = ${search}`)
            const node = getRandomNode()

            if (!node) {
                return res.redirect(301, `https://silentpass.io/download/index.html`)
            }

            res.redirect(302, `https://${node.domain}.conet.network/download/index.html${search}`)
		})

        await getAllNodes()
		logger(`start master server!`)

		server.listen(this.PORT, '127.0.0.1', () => {
			return console.table([
				{ 'CoNET paymentHook': `started success ${ this.PORT }` }
			])
		})
	}

}

new conet_dl_server ()


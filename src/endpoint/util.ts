import {ethers} from 'ethers'
import { join } from 'node:path'
import { homedir, platform } from 'node:os'
import cCNTPAbi from '../util/cCNTP.json'
import { logger } from '../util/util'

import Colors from 'colors/safe'
const setup = join( homedir(),'.master.json' )

const CONET_Holesky_RPC = 'https://rpc.conet.network'
const provider = new ethers.JsonRpcProvider(CONET_Holesky_RPC)
const masterSetup: ICoNET_DL_masterSetup = require ( setup )
const Claimable_CONET_Point_addr = '0x530cf1B598D716eC79aa916DD2F05ae8A0cE8ee2'
export const cntpAdminWallet = new ethers.Wallet(masterSetup.conetFaucetAdmin)


logger(Colors.blue(`Node Key = ${cntpAdminWallet.address}`))
const getWalletsAsset = (wallets: string[]) => {
	
}
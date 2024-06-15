import {sendClaimableAsset, masterSetup, realToClaimableContractAddress, logger} from './util'
import {ethers} from 'ethers'
import Colors from 'colors/safe'
const test = async () => {
	const name = 'wusdt'
	const wallet = '0x4CD2f8Ae20534510728C4A1B806059D2725c2684'
	const retClaimableContractAddress = realToClaimableContractAddress('wusdt')
	const units = '125'
	logger(Colors.blue(` ${name} [${retClaimableContractAddress}] ${units} to ${wallet}`))
	await sendClaimableAsset(masterSetup.conetFaucetAdmin[0], retClaimableContractAddress, wallet, units)
}
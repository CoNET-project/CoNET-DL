import {sendClaimableAsset, masterSetup, realToClaimableContractAddress, logger} from './util'
import {ethers} from 'ethers'
import Colors from 'colors/safe'
const test = async () => {
	const name = 'wusdt'
	const wallet = '0xefdaA48BB1961AEfBF6d0295ea96FB034543995c'
	const retClaimableContractAddress = realToClaimableContractAddress('wusdt')
	const units = ethers.parseUnits('2625', 'ether').toString()
	logger(Colors.blue(` ${name} [${retClaimableContractAddress}] ${units} [${ethers.formatEther(units)}] to ${wallet}`))
	await sendClaimableAsset(masterSetup.conetFaucetAdmin[0], retClaimableContractAddress, wallet,units)
}

test()
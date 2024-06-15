import {sendClaimableAsset, masterSetup, realToClaimableContractAddress} from './util'
import ethers from 'ethers'
const test = async () => {
	const retClaimableContractAddress = realToClaimableContractAddress('wusdt')
	await sendClaimableAsset(masterSetup.conetFaucetAdmin[0],  retClaimableContractAddress, '0xefdaA48BB1961AEfBF6d0295ea96FB034543995c', ethers.formatEther('2625'))
}

test()
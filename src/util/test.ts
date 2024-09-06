import {sendGuardianNodesContract, masterSetup, checkTx, getNetworkName, logger, checkReferralsV2_OnCONET_Holesky, returnGuardianPlanReferral, CONET_guardian_purchase_Receiving_Address, checkSign, getAssetERC20Address, checkErc20Tx} from './util'
import {inspect} from 'node:util'
import {ethers} from 'ethers'
import Colors from 'colors/safe'
import assetOracle_ABI from '../endpoint/oracleAsset.ABI.json'



const wusdt = {
    "message": "{\"walletAddress\":\"0x5C809C34112911199e748B0d70173Acb18E5533a\",\"data\":{\"receiptTx\":\"0x9eeb42a939737594d9947b7d2496c6f76f10eb1ccf156598ac0e1975e36070a0\",\"publishKeys\":[\"0xBEDbA14A87C60263e8b643D8604a3bea31285f4d\"],\"nodes\":1,\"tokenName\":\"wusdt\",\"network\":\"BSC\",\"amount\":\"1250000000000000000000\"}}",
    "signMessage": "0x127ee9f8c51deae07cf722babdb3faf15673162a2ce217c83bf5320054df869665bf57fad0d4f13d0dd2090e1f382c9e078a05031b63c70f3f6554ee6504c5d21c"
}
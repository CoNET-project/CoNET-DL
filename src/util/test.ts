import {sendGuardianNodesContract, masterSetup, checkTx, getNetworkName, logger, checkReferralsV2_OnCONET_Holesky, returnGuardianPlanReferral, CONET_guardian_purchase_Receiving_Address, checkSign, getAssetERC20Address, checkErc20Tx} from './util'
import {inspect} from 'node:util'
import {ethers} from 'ethers'
import Colors from 'colors/safe'
import assetOracle_ABI from '../endpoint/oracleAsset.ABI.json'



const wusdt = {
    "message": "{\"walletAddress\":\"0x5C809C34112911199e748B0d70173Acb18E5533a\",\"data\":{\"receiptTx\":\"0x9d8bb248e5935535e067aaa955409000bf5c0db468f3cd01c42b09cfe55f163d\",\"publishKeys\":[\"0x94C2c5Ec60bC5192E8dC8f2466f919668D34B456\"],\"nodes\":1,\"tokenName\":\"wusdt\",\"network\":\"\",\"amount\":\"1250000000000000000000\"}}",
    "signMessage": "0x17181c23881c4bd674c70688c80006c1287481eab7dbcc11ae895dedb8db68dc73730275267c7fc38d656b6d3d9250a656a5455e7179c92ef7a4308830e302081b"
}
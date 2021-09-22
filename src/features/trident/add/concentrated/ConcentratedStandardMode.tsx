import React, { FC } from 'react'
import AssetInput from '../../../../components/AssetInput'
import TransactionDetails from '../TransactionDetails'
import { attemptingTxnAtom, poolAtom, showReviewAtom, spendFromWalletAtom } from '../../context/atoms'
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil'

import TridentApproveGate from '../../TridentApproveGate'
import Dots from '../../../../components/Dots'
import { t } from '@lingui/macro'
import { classNames } from '../../../../functions'
import Button from '../../../../components/Button'
import Typography from '../../../../components/Typography'
import Lottie from 'lottie-react'
import loadingCircle from '../../../../animation/loading-circle.json'
import { useBentoBoxContract } from '../../../../hooks'
import { useLingui } from '@lingui/react'
import { TypedField, useDependentAssetInputs } from '../../context/hooks/useDependentAssetInputs'

const ConcentratedStandardMode: FC = () => {
  const { i18n } = useLingui()
  const [, pool] = useRecoilValue(poolAtom)
  const bentoBox = useBentoBoxContract()

  const {
    mainInput: [, setMainInput],
    secondaryInput: [, setSecondaryInput],
    formattedAmounts,
    parsedAmounts: [parsedAmountA, parsedAmountB],
    typedField: [, setTypedField],
    onMax,
    isMax,
    error,
  } = useDependentAssetInputs()

  const setShowReview = useSetRecoilState(showReviewAtom)
  const [spendFromWallet, setSpendFromWallet] = useRecoilState(spendFromWalletAtom)
  const attemptingTxn = useRecoilValue(attemptingTxnAtom)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 px-5">
        <AssetInput
          value={formattedAmounts[0]}
          currency={pool?.token0}
          onChange={(val) => {
            setTypedField(TypedField.A)
            setMainInput(val)
          }}
          headerRight={
            <AssetInput.WalletSwitch onChange={() => setSpendFromWallet(!spendFromWallet)} checked={spendFromWallet} />
          }
          spendFromWallet={spendFromWallet}
        />
        <AssetInput
          value={formattedAmounts[1]}
          currency={pool?.token1}
          onChange={(val) => {
            setTypedField(TypedField.B)
            setSecondaryInput(val)
          }}
          spendFromWallet={spendFromWallet}
        />

        <div className="flex flex-col gap-3">
          <TridentApproveGate inputAmounts={[parsedAmountA, parsedAmountB]} tokenApproveOn={bentoBox?.address}>
            {({ approved, loading }) => {
              const disabled = !!error || !approved || loading || attemptingTxn
              const buttonText = attemptingTxn ? (
                <Dots>{i18n._(t`Depositing`)}</Dots>
              ) : loading ? (
                ''
              ) : error ? (
                error
              ) : (
                i18n._(t`Confirm Deposit`)
              )

              return (
                <div className={classNames(onMax && !isMax ? 'grid grid-cols-2 gap-3' : 'flex')}>
                  {!isMax && (
                    <Button color="gradient" variant={isMax ? 'filled' : 'outlined'} disabled={isMax} onClick={onMax}>
                      <Typography
                        variant="sm"
                        weight={700}
                        className={!isMax ? 'text-high-emphesis' : 'text-low-emphasis'}
                      >
                        {i18n._(t`Max Deposit`)}
                      </Typography>
                    </Button>
                  )}
                  <Button
                    {...(loading && {
                      startIcon: (
                        <div className="w-4 h-4 mr-1">
                          <Lottie animationData={loadingCircle} autoplay loop />
                        </div>
                      ),
                    })}
                    color="gradient"
                    disabled={disabled}
                    onClick={() => setShowReview(true)}
                  >
                    <Typography
                      variant="sm"
                      weight={700}
                      className={!error ? 'text-high-emphesis' : 'text-low-emphasis'}
                    >
                      {buttonText}
                    </Typography>
                  </Button>
                </div>
              )
            }}
          </TridentApproveGate>
        </div>
      </div>
      {!error && (
        <div className="flex flex-col px-5">
          <TransactionDetails />
        </div>
      )}
    </div>
  )
}

export default ConcentratedStandardMode
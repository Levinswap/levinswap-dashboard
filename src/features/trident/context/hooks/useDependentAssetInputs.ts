import { atom, selector, useRecoilState, useRecoilValue } from 'recoil'
import {
  bentoboxRebasesAtom,
  currenciesAtom,
  fixedRatioAtom,
  noLiquiditySelector,
  poolAtom,
  spendFromWalletAtom,
} from '../atoms'
import { Currency, CurrencyAmount, ZERO } from '@sushiswap/core-sdk'
import { useCallback, useMemo } from 'react'
import { maxAmountSpend, toAmountCurrencyAmount, toShareCurrencyAmount, tryParseAmount } from '../../../../functions'
import { useActiveWeb3React } from '../../../../hooks'
import { t } from '@lingui/macro'
import { useLingui } from '@lingui/react'
import { useBentoOrWalletBalances } from '../../../../hooks/useBentoOrWalletBalance'

export enum TypedField {
  A,
  B,
}

export const mainInputAtom = atom<string>({
  key: 'mainInputAtom',
  default: '',
})

// Just an atom that acts as a copy state to hold a previous value
export const secondaryInputAtom = atom<string>({
  key: 'secondaryInputAtom',
  default: '',
})

export const typedFieldAtom = atom<TypedField>({
  key: 'typedFieldAtom',
  default: TypedField.A,
})

export const secondaryInputSelector = selector<string>({
  key: 'secondaryInputSelector',
  get: ({ get }) => {
    const mainInputCurrencyAmount = get(mainInputCurrencyAmountSelector)
    const noLiquidity = get(noLiquiditySelector)
    const fixedRatio = get(fixedRatioAtom)
    const typedField = get(typedFieldAtom)
    const rebases = get(bentoboxRebasesAtom)

    // If we have liquidity, when a user tries to 'get' this value (by setting mainInput), calculate amount in terms of mainInput amount
    if (!noLiquidity && fixedRatio && typedField === TypedField.A) {
      const [, pool] = get(poolAtom)
      const [tokenA, tokenB] = [pool?.token0?.wrapped, pool?.token1?.wrapped]

      if (tokenA && tokenB && pool && mainInputCurrencyAmount?.wrapped) {
        const dependentTokenAmount = toAmountCurrencyAmount(
          rebases[tokenB.wrapped.address],
          pool
            .priceOf(tokenA)
            .quote(toShareCurrencyAmount(rebases[tokenA.wrapped.address], mainInputCurrencyAmount?.wrapped))
        )

        return (
          pool?.token1?.isNative
            ? CurrencyAmount.fromRawAmount(pool?.token1, dependentTokenAmount.quotient)
            : dependentTokenAmount
        ).toExact()
      }
    }

    // If we don't have liquidity and we 'get' this value, return previous value as no side effects will happen
    return mainInputCurrencyAmount?.equalTo(ZERO) ? '0' : get(secondaryInputAtom)
  },
  set: ({ set, get }, newValue: string) => {
    const noLiquidity = get(noLiquiditySelector)
    const typedField = get(typedFieldAtom)
    const fixedRatio = get(fixedRatioAtom)
    const rebases = get(bentoboxRebasesAtom)

    // If we have liquidity, when a user tries to 'set' this value, calculate mainInput amount in terms of this amount
    if (!noLiquidity && fixedRatio) {
      const [, pool] = get(poolAtom)
      const [tokenA, tokenB] = [pool?.token0?.wrapped, pool?.token1?.wrapped]
      const newValueCA = tryParseAmount(newValue, pool?.token1)

      if (tokenA && tokenB && pool && newValueCA?.wrapped) {
        const dependentTokenAmount = toAmountCurrencyAmount(
          rebases[tokenA.wrapped.address],
          pool.priceOf(tokenB).quote(toShareCurrencyAmount(rebases[tokenB.wrapped.address], newValueCA?.wrapped))
        )
        set(mainInputAtom, dependentTokenAmount?.toExact())
      }

      // Edge case where if we enter 0 on secondary input, also set mainInput to 0
      else if (typedField === TypedField.B) {
        set(mainInputAtom, '')
      }
    }

    // In any case, 'set' this value directly to the atom to keep a copy saved as a string
    set(secondaryInputAtom, newValue)
  },
})

export const mainInputCurrencyAmountSelector = selector<CurrencyAmount<Currency> | undefined>({
  key: 'mainInputCurrencyAmountSelector',
  get: ({ get }) => {
    const value = get(mainInputAtom)
    const [currencyA] = get(currenciesAtom)
    return tryParseAmount(value, currencyA)
  },
})

export const secondaryInputCurrencyAmountSelector = selector<CurrencyAmount<Currency> | undefined>({
  key: 'secondaryInputCurrencyAmountSelector',
  get: ({ get }) => {
    const value = get(secondaryInputSelector)
    const [, currencyB] = get(currenciesAtom)
    return tryParseAmount(value, currencyB)
  },
})

export const formattedAmountsSelector = selector<[string, string]>({
  key: 'formattedAmountsSelector',
  get: ({ get }) => {
    const inputField = get(typedFieldAtom)
    const [parsedAmountA, parsedAmountB] = get(parsedAmountsSelector)
    return [
      (inputField === TypedField.A ? get(mainInputAtom) : parsedAmountA?.toSignificant(6)) ?? '',
      (inputField === TypedField.B ? get(secondaryInputAtom) : parsedAmountB?.toSignificant(6)) ?? '',
    ]
  },
})

// Derive parsedAmounts from formattedAmounts
export const parsedAmountsSelector = selector<
  [CurrencyAmount<Currency> | undefined, CurrencyAmount<Currency> | undefined]
>({
  key: 'parsedAmountsSelector',
  get: ({ get }) => {
    return [get(mainInputCurrencyAmountSelector), get(secondaryInputCurrencyAmountSelector)]
  },
})

// When adding liquidity, poolAtom is defined and provides us with the tokens
export const useDependentAssetInputs = () => {
  const { i18n } = useLingui()
  const { account } = useActiveWeb3React()
  const [poolState, pool] = useRecoilValue(poolAtom)
  const mainInput = useRecoilState(mainInputAtom)
  const secondaryInput = useRecoilState(secondaryInputSelector)
  const formattedAmounts = useRecoilValue(formattedAmountsSelector)
  const parsedAmounts = useRecoilValue(parsedAmountsSelector)
  const noLiquidity = useRecoilValue(noLiquiditySelector)
  const typedField = useRecoilState(typedFieldAtom)
  const fixedRatio = useRecoilValue(fixedRatioAtom)
  const spendFromWallet = useRecoilValue(spendFromWalletAtom)
  const currencies = useMemo(
    () => parsedAmounts.reduce<Currency[]>((acc, cur) => [...acc, ...(cur ? [cur.currency] : [])], []),
    [parsedAmounts]
  )
  const balances = useBentoOrWalletBalances(account ?? undefined, currencies, spendFromWallet)

  const onMax = useCallback(async () => {
    if (!balances || !pool || !balances[0] || !balances[1]) return
    if (!noLiquidity && fixedRatio) {
      if (pool.priceOf(pool.token0).quote(balances[0].wrapped)?.lessThan(balances[1].wrapped)) {
        typedField[1](TypedField.A)
        mainInput[1](maxAmountSpend(balances[0])?.toExact() || '')
      } else {
        typedField[1](TypedField.B)
        secondaryInput[1](maxAmountSpend(balances[1])?.toExact() || '')
      }
    } else {
      mainInput[1](maxAmountSpend(balances[0])?.toExact() || '')
      secondaryInput[1](maxAmountSpend(balances[1])?.toExact() || '')
    }
  }, [balances, fixedRatio, mainInput, noLiquidity, pool, secondaryInput, typedField])

  const isMax = useMemo(() => {
    if (!balances || !pool || !balances[0] || !balances[1]) return false

    if (!noLiquidity && fixedRatio) {
      return pool.priceOf(pool.token0).quote(balances[0].wrapped)?.lessThan(balances[1].wrapped)
        ? parsedAmounts[0]?.equalTo(maxAmountSpend(balances[0]) || '')
        : parsedAmounts[1]?.equalTo(maxAmountSpend(balances[1]) || '')
    } else {
      return (
        parsedAmounts[0]?.equalTo(maxAmountSpend(balances[0]) || '') &&
        parsedAmounts[1]?.equalTo(maxAmountSpend(balances[1]) || '')
      )
    }
  }, [balances, fixedRatio, noLiquidity, parsedAmounts, pool])

  const insufficientBalance = useMemo(() => {
    return parsedAmounts.find((el, index) => {
      return balances && el ? balances?.[index]?.lessThan(el) : false
    })
  }, [balances, parsedAmounts])

  let error = !account
    ? i18n._(t`Connect Wallet`)
    : poolState === 3
    ? i18n._(t`Invalid pool`)
    : !parsedAmounts[0]?.greaterThan(ZERO) && !parsedAmounts[1]?.greaterThan(ZERO)
    ? i18n._(t`Enter an amount`)
    : insufficientBalance
    ? i18n._(t`Insufficient ${insufficientBalance.currency.symbol} balance`)
    : ''

  return useMemo(
    () => ({
      inputs: [mainInput[0], secondaryInput[0]],
      mainInput,
      secondaryInput,
      formattedAmounts,
      parsedAmounts,
      typedField,
      onMax,
      isMax,
      error,
    }),
    [error, formattedAmounts, isMax, mainInput, onMax, parsedAmounts, secondaryInput, typedField]
  )
}
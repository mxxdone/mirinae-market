package com.mirinae.market.modules.account.business;

/** 계정 연결 결과다. 증명된 후보 계정 정보를 최종 연결 트랜잭션에 전달한다. */
public record LinkedAccount(long accountId, String loginId, String role, long authVersion) {}

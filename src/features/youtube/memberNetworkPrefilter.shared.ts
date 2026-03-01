import type { YTMemberBlockMode } from '../../lib/settings';

export type MemberNetworkPrefilterConfig = {
    enabled: boolean;
    mode: YTMemberBlockMode;
    blocklist: string[];
    allowlist: string[];
};

export const MEMBER_NETWORK_PREFILTER_PAGE_SCRIPT_PATH = 'assets/yt-member-prefilter.page.js';
export const MEMBER_NETWORK_PREFILTER_INJECTED_SCRIPT_ID = 'vb-yt-member-network-prefilter';
export const MEMBER_NETWORK_PREFILTER_GLOBAL_KEY = '__VB_YT_MEMBER_PREFILTER__';
export const MEMBER_NETWORK_PREFILTER_BRIDGE_CHANNEL = 'vb:yt-member-prefilter';
export const MEMBER_NETWORK_PREFILTER_PAGE_SOURCE = 'vb:yt-member-prefilter:page';
export const MEMBER_NETWORK_PREFILTER_CONTENT_SOURCE = 'vb:yt-member-prefilter:content';

export const DEFAULT_MEMBER_NETWORK_PREFILTER_CONFIG: MemberNetworkPrefilterConfig = {
    enabled: false,
    mode: 'all',
    blocklist: [],
    allowlist: []
};

export function cloneMemberNetworkPrefilterConfig(
    config: MemberNetworkPrefilterConfig
): MemberNetworkPrefilterConfig {
    return {
        enabled: config.enabled,
        mode: config.mode,
        blocklist: [...config.blocklist],
        allowlist: [...config.allowlist]
    };
}

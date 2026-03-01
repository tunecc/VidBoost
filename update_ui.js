const fs = require('fs');
const file = '/Users/tune/Documents/GitHub/VidBoost/src/popup/App.svelte';
let content = fs.readFileSync(file, 'utf8');

const newBlock = `              <!-- CDN Node Selector -->
              <div class="pt-1.5 relative">
                <div class="flex items-center justify-between mb-2 px-0.5">
                  <span class="text-[11px] text-gray-500 dark:text-white/40 font-medium tracking-wide">
                    {t("bb_cdn_node")}
                  </span>
                  <!-- Integrated Speed Test Button -->
                  <button
                    class="shrink-0 text-[10px] font-medium px-2 py-1.5 rounded-lg transition-all z-10
                      {bbCdnTesting
                      ? 'bg-cyan-500/20 text-cyan-400 cursor-wait'
                      : 'bg-cyan-500/10 text-cyan-500 hover:bg-cyan-500/20 hover:scale-[1.03] active:scale-[0.97] dark:text-cyan-400'}"
                    disabled={!globalEnabled || !bbCdnEnabled || bbCdnTesting}
                    on:click={(e) => {
                      e.stopPropagation();
                      if (bbCdnTesting) return;
                      bbCdnTesting = true;
                      bbCdnDropdownOpen = true;
                      bbCdnSpeedResults = {};
                      if (chrome?.tabs) {
                        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                          if (tabs[0]?.id) {
                            chrome.tabs.sendMessage(
                              tabs[0].id,
                              {
                                type: "VB_CDN_SPEED_TEST",
                                nodes: CDN_NODES.map((n) => ({ id: n.id, host: n.host }))
                              },
                              () => {}
                            );
                          }
                        });
                        const resultKey = "bb_cdn_speed_results";
                        const checkResults = () => {
                          chrome.storage.local.get([resultKey], (res) => {
                            if (res[resultKey]) {
                              bbCdnSpeedResults = res[resultKey];
                              if (Object.keys(bbCdnSpeedResults).length >= CDN_NODES.length) {
                                bbCdnTesting = false;
                                chrome.storage.local.remove([resultKey]);
                              } else {
                                setTimeout(checkResults, 800);
                              }
                            } else {
                              setTimeout(checkResults, 800);
                            }
                          });
                        };
                        setTimeout(checkResults, 1500);
                      }
                    }}
                  >
                    {bbCdnTesting ? t("bb_cdn_testing") : t("bb_cdn_speed_test")}
                  </button>
                </div>
                
                <!-- Custom Select Button -->
                <button
                  class="w-full flex items-center justify-between rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 p-2 text-left transition-all hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden"
                  disabled={!globalEnabled || !bbCdnEnabled}
                  on:click={() => (bbCdnDropdownOpen = true)}
                >
                  <div class="flex items-center gap-2.5 overflow-hidden">
                    <div class="shrink-0 w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-500 dark:text-cyan-400 flex items-center justify-center">
                      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                      </svg>
                    </div>
                    <div class="flex flex-col truncate">
                      <span class="text-xs font-semibold text-gray-700 dark:text-white/90 truncate">
                        {bbCdnNode ? CDN_NODES.find(n => n.host === bbCdnNode)?.label || bbCdnNode : t("bb_cdn_default")}
                      </span>
                      <span class="text-[9px] text-gray-400 dark:text-white/40 truncate mt-0.5">
                        {bbCdnNode || "Auto (System Default)"}
                      </span>
                    </div>
                  </div>
                  
                  <div class="flex items-center gap-2 rtl:flex-row-reverse" on:click|stopPropagation>
                    <svg class="w-4 h-4 text-gray-400 transition-transform duration-300 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                <!-- Bottom Sheet -->
                {#if bbCdnDropdownOpen && globalEnabled && bbCdnEnabled}
                  <div class="fixed inset-0 z-40 bg-black/20 dark:bg-black/40 backdrop-blur-sm cursor-pointer transition-opacity animate-in fade-in duration-200" on:click={() => (bbCdnDropdownOpen = false)}></div>
                  <div class="fixed inset-x-0 bottom-0 z-50 bg-white/95 dark:bg-[#1e1e1e]/95 backdrop-blur-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.12)] border-t border-black/5 dark:border-white/10 rounded-t-2xl flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-full duration-300">
                    <div class="shrink-0 pt-3 pb-2 flex flex-col items-center">
                      <div class="w-12 h-1 bg-black/10 dark:bg-white/10 rounded-full mb-3"></div>
                      <span class="text-[13px] font-semibold text-gray-800 dark:text-white/90 tracking-wide">{t("bb_cdn_node")}</span>
                    </div>
                    <div class="overflow-y-auto scrollbar-none w-full px-3 pb-6 flex flex-col gap-1.5">
                      
                      <!-- Default Option -->
                      <button
                        class="w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5
                          {bbCdnNode === '' ? 'bg-cyan-500/10' : ''}"
                        on:click={() => {
                          bbCdnNode = "";
                          bbCdnDropdownOpen = false;
                        }}
                      >
                        <span class="text-xs font-semibold {bbCdnNode === '' ? 'text-cyan-600 dark:text-cyan-400' : 'text-gray-700 dark:text-white/80'}">
                          {t("bb_cdn_default")}
                        </span>
                        {#if bbCdnNode === ""}
                          <svg class="w-4 h-4 text-cyan-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                        {/if}
                      </button>

                      {#each CDN_NODES as node}
                        <button
                          class="w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5 group relative
                            {bbCdnNode === node.host ? 'bg-cyan-500/10' : ''}"
                          on:click={() => {
                            bbCdnNode = node.host;
                            bbCdnDropdownOpen = false;
                          }}
                        >
                          <div class="flex flex-col truncate pr-3">
                            <span class="text-[13px] font-semibold truncate transition-colors {bbCdnNode === node.host ? 'text-cyan-600 dark:text-cyan-400' : 'text-gray-700 dark:text-white/80 group-hover:text-gray-900 dark:group-hover:text-white'}">
                              {node.label}
                            </span>
                            <span class="text-[10px] text-gray-400 dark:text-white/30 truncate mt-1 transition-colors">
                              {node.host}
                            </span>
                          </div>
                          
                          <!-- Right Side Content -->
                          <div class="flex items-center gap-2 shrink-0">
                            <!-- Speed Pill -->
                            {#if bbCdnSpeedResults[node.id]}
                              {#if bbCdnSpeedResults[node.id].error}
                                <div class="px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-wide bg-red-500/10 text-red-600 dark:text-red-400 ring-1 ring-inset ring-red-500/20">
                                  {bbCdnSpeedResults[node.id].speed}
                                </div>
                              {:else}
                                <div class="px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-wide flex items-center gap-1.5
                                  {parseFloat(bbCdnSpeedResults[node.id].speed) >= 5 
                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/20' 
                                    : parseFloat(bbCdnSpeedResults[node.id].speed) >= 1 
                                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-inset ring-amber-500/20' 
                                      : 'bg-red-500/10 text-red-600 dark:text-red-400 ring-1 ring-inset ring-red-500/20'}">
                                  {#if parseFloat(bbCdnSpeedResults[node.id].speed) >= 5}
                                    <div class="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.8)] relative">
                                      <div class="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-75"></div>
                                    </div>
                                  {/if}
                                  {bbCdnSpeedResults[node.id].speed} <span class="text-[9px] font-medium opacity-70">MB/s</span>
                                </div>
                              {/if}
                            {/if}
                            
                            <!-- Checkmark -->
                            {#if bbCdnNode === node.host}
                              <svg class="w-4 h-4 text-cyan-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                            {/if}
                          </div>
                        </button>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>`;

const startIdx = content.indexOf('<!-- CDN Node Selector -->');
const endMarker = '<!-- Bangumi Enhanced Mode -->';
const endIdx = content.indexOf(endMarker);

if (startIdx !== -1 && endIdx !== -1) {
    content = content.slice(0, startIdx) + newBlock + '\n\n              ' + content.slice(endIdx);
    fs.writeFileSync(file, content);
    console.log('Successfully updated App.svelte');
} else {
    console.log('Could not find markers');
}

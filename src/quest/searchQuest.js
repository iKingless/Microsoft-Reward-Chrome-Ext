class SearchQuest {
    constructor() {
        this.reset();
    }

    reset() {
        this._status_ = null;
        this._googleTrend_ = new GoogleTrend();
        this._pcSearchWordIdx_ = 0;
        this._mbSearchWordIdx_ = 0;
        this._currentSearchCount_ = 0;
        this._currentSearchType_ = null;
        this._jobStatus_ = STATUS_NONE;
    }

    get jobStatus() {
        return this._jobStatus_;
    }

    async doWork(status) {
        console.assert(status != null);
        
        this._status_ = status;
        this._jobStatus_ = STATUS_BUSY;
        try {
            await this._startSearchQuests();
            await this._doWorkClosedLoop(status);
        } catch (ex) {
            this._jobStatus_ = STATUS_ERROR;
            throw ex;
        }
    }

    async _doWorkClosedLoop(status){
        await status.update();
        if (status.isSearchCompleted) {
            return;
        }

        if (status.jobStatus==STATUS_ERROR || !status.summary.isValid) {
            this._jobStatus_ = STATUS_ERROR;
            return;
        }

        await this._startSearchQuests();
        await this._doWorkRecursion(status);
    }

    async _startSearchQuests() {
        // Check if we have enough words to carry on searching
        var numSearchWordsRequired = this._getNumberOfSearchWordsRequired();
        if (numSearchWordsRequired > this._googleTrend_.googleTrendWords.length) {
            // If not, add more words to the array
            await this._googleTrend_.getGoogleTrendWords(numSearchWordsRequired)
        } 
        // We can roll.
        await this._performPcSearch();
        await this._performMbSearch();
        this._quitSearchCleanUp();
    }

    _getNumberOfSearchWordsRequired() {
        return Math.max(
            this._pcSearchWordIdx_ + this._status_.pcSearchStatus.searchNeededCount,
            this._mbSearchWordIdx_ + this._status_.mbSearchStatus.searchNeededCount);
    }

    async _performPcSearch() {
        this._initiateSearch();
        if (this._currentSearchType_ != SEARCH_TYPE_PC_SEARCH) {
            this._preparePCSearch();
        }

        await this._requestBingSearch();
    }

    async _performMbSearch() {
        this._initiateSearch();
        if (this._currentSearchType_ != SEARCH_TYPE_MB_SEARCH) {
            this._prepareMbSearch();
        }

        await this._requestBingSearch();
    }

    _initiateSearch() {
        this._currentSearchCount_ = 0;
    }

    _preparePCSearch() {
        this._currentSearchType_ = SEARCH_TYPE_PC_SEARCH;
        removeUA();
        setMsEdgeUA();
    }

    _prepareMbSearch() {
        this._currentSearchType_ = SEARCH_TYPE_MB_SEARCH;
        removeUA();
        setMobileUA();
    }

    _quitSearchCleanUp() {
        if (this._jobStatus_ == STATUS_BUSY) {
            this._jobStatus_ = STATUS_DONE;
        }
        this._currentSearchType_ = null;
        removeUA();
    }

    async _requestBingSearch() {
        if (this._isCurrentSearchCompleted()) {
            return;
        }
        
        try {
            var response = await fetch(this._getBingSearchUrl());
        } catch (ex) {
            throw new FetchFailedException('Search', ex);
        }        
        
        if (response.status != 200) {
            throw new FetchResponseAnomalyException('Search')
        }

        this._currentSearchCount_++;

        await this._requestBingSearch();
    }

    _getBingSearchUrl() {
        if (this._currentSearchType_ == SEARCH_TYPE_PC_SEARCH) {
            var word = this._googleTrend_.googleTrendWords[this._pcSearchWordIdx_];
            this._pcSearchWordIdx_++;
        } else {
            word = this._googleTrend_.googleTrendWords[this._mbSearchWordIdx_];
            this._mbSearchWordIdx_++;
        }
        return 'https://www.bing.com/search?q=' + word;
    }

    _isCurrentSearchCompleted() {
        return this._currentSearchType_ == SEARCH_TYPE_PC_SEARCH ?
            this._currentSearchCount_ >= this._status_.pcSearchStatus.searchNeededCount :
            this._currentSearchCount_ >= this._status_.mbSearchStatus.searchNeededCount;
    }
}

const MB_USER_AGENT = 'Mozilla/5.0 (Linux; Android 4.0.4; Galaxy Nexus Build/IMM76B) AppleWebKit/535.19 (KHTML, like Gecko) Chrome/18.0.1025.133 Mobile Safari/535.19';
const EDGE_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36 Edge/17.17134';
const SEARCH_TYPE_PC_SEARCH = 0;
const SEARCH_TYPE_MB_SEARCH = 1;

function removeUA() {
    // remove user-agent
    try {
        chrome.webRequest.onBeforeSendHeaders.removeListener(toMobileUA);
    } catch (ex) {}
    try {
        chrome.webRequest.onBeforeSendHeaders.removeListener(toMsEdgeUA);
    } catch (ex) {}
}

function setMsEdgeUA() {
    chrome.webRequest.onBeforeSendHeaders.addListener(toMsEdgeUA, {
        urls: ['https://www.bing.com/search?q=*']
    }, ['blocking', 'requestHeaders']);
}

function toMsEdgeUA(details) {
    for (let i in details.requestHeaders) {
        if (details.requestHeaders[i].name === 'User-Agent') {
            details.requestHeaders[i].value = EDGE_USER_AGENT;
            break;
        }
    }
    return {
        requestHeaders: details.requestHeaders
    };
}

function setMobileUA() {
    chrome.webRequest.onBeforeSendHeaders.addListener(toMobileUA, {
        urls: ['https://www.bing.com/search?q=*']
    }, ['blocking', 'requestHeaders']);
}

function toMobileUA(details) {
    for (let i in details.requestHeaders) {
        if (details.requestHeaders[i].name === 'User-Agent') {
            details.requestHeaders[i].value = MB_USER_AGENT;
            break;
        }
    }
    return {
        requestHeaders: details.requestHeaders
    };
}

const STATUS_NONE = 0;
const STATUS_BUSY = 1;
const STATUS_DONE = 20;
const STATUS_WARNING = 30;
const STATUS_ERROR = 3;
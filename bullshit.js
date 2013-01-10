/**
 * findAndReplaceDOMText v 0.2
 * @author James Padolsey http://james.padolsey.com
 * @license http://unlicense.org/UNLICENSE
 *
 * Matches the text of a DOM node against a regular expression
 * and replaces each match (or node-separated portions of the match)
 * in the specified element.
 *
 * Example: Wrap 'test' in <em>:
 *   <p id="target">This is a test</p>
 *   <script>
 *     findAndReplaceDOMText(
 *       /test/,
 *       document.getElementById('target'),
 *       'em'
 *     );
 *   </script>
 */
window.findAndReplaceDOMText = (function() {

  /** 
   * findAndReplaceDOMText
   * 
   * Locates matches and replaces with replacementNode
   *
   * @param {RegExp} regex The regular expression to match
   * @param {Node} node Element or Text node to search within
   * @param {String|Element|Function} replacementNode A NodeName,
   *  Node to clone, or a function which returns a node to use
   *  as the replacement node.
   * @param {Number} captureGroup A number specifiying which capture
   *  group to use in the match. (optional)
   */
  function findAndReplaceDOMText(regex, node, replacementNode, captureGroup) {

    var m, matches = [], text = _getText(node);
    var replaceFn = _genReplacer(replacementNode);

    if (!text) { return; }

    if (regex.global) {
      while (m = regex.exec(text)) {
        matches.push(_getMatchIndexes(m, captureGroup));
      }
    } else {
      m = text.match(regex);
      matches.push(_getMatchIndexes(m, captureGroup));
    }

    if (matches.length) {
      _stepThroughMatches(node, matches, replaceFn);
    }
  }

  /**
   * Gets the start and end indexes of a match
   */
  function _getMatchIndexes(m, captureGroup) {

    captureGroup = captureGroup || 0;
 
    if (!m[0]) throw 'findAndReplaceDOMText cannot handle zero-length matches';
 
    var index = m.index;

    if (captureGroup > 0) {
      var cg = m[captureGroup];
      if (!cg) throw 'Invalid capture group';
      index += m[0].indexOf(cg);
      m[0] = cg;
    } 

    return [ index, index + m[0].length, [ m[0] ] ];
  };

  /**
   * Gets aggregate text of a node without resorting
   * to broken innerText/textContent
   */
  function _getText(node) {

    if (node.nodeType === 3) {
      return node.data;
    }

    var txt = '';

    if (node = node.firstChild) do {
      txt += _getText(node);
    } while (node = node.nextSibling);

    return txt;

  }

  /** 
   * Steps through the target node, looking for matches, and
   * calling replaceFn when a match is found.
   */
  function _stepThroughMatches(node, matches, replaceFn) {

    var after, before,
        startNode,
        endNode,
        startNodeIndex,
        endNodeIndex,
        innerNodes = [],
        atIndex = 0,
        curNode = node,
        matchLocation = matches.shift(),
        matchIndex = 0;

    out: while (true) {

      if (curNode.nodeType === 3) {
        if (!endNode && curNode.length + atIndex >= matchLocation[1]) {
          // We've found the ending
          endNode = curNode;
          endNodeIndex = matchLocation[1] - atIndex;
        } else if (startNode) {
          // Intersecting node
          innerNodes.push(curNode);
        }
        if (!startNode && curNode.length + atIndex > matchLocation[0]) {
          // We've found the match start
          startNode = curNode;
          startNodeIndex = matchLocation[0] - atIndex;
        }
        atIndex += curNode.length;
      }

      if (startNode && endNode) {
        curNode = replaceFn({
          startNode: startNode,
          startNodeIndex: startNodeIndex,
          endNode: endNode,
          endNodeIndex: endNodeIndex,
          innerNodes: innerNodes,
          match: matchLocation[2],
          matchIndex: matchIndex
        });
        // replaceFn has to return the node that replaced the endNode
        // and then we step back so we can continue from the end of the 
        // match:
        atIndex -= (endNode.length - endNodeIndex);
        startNode = null;
        endNode = null;
        innerNodes = [];
        matchLocation = matches.shift();
        matchIndex++;
        if (!matchLocation) {
          break; // no more matches
        }
      } else if (curNode.firstChild || curNode.nextSibling) {
        // Move down or forward:
        curNode = curNode.firstChild || curNode.nextSibling;
        continue;
      }

      // Move forward or up:
      while (true) {
        if (curNode.nextSibling) {
          curNode = curNode.nextSibling;
          break;
        } else if (curNode.parentNode !== node) {
          curNode = curNode.parentNode;
        } else {
          break out;
        }
      }

    }

  }

  var reverts;
  /**
   * Reverts the last findAndReplaceDOMText process
   */
  findAndReplaceDOMText.revert = function revert() {
    for (var i = 0, l = reverts.length; i < l; ++i) {
      reverts[i]();
    }
    reverts = [];
  };

  /** 
   * Generates the actual replaceFn which splits up text nodes
   * and inserts the replacement element.
   */
  function _genReplacer(nodeName) {

    reverts = [];

    var makeReplacementNode;

    if (typeof nodeName != 'function') {
      var stencilNode = nodeName.nodeType ? nodeName : document.createElement(nodeName);
      makeReplacementNode = function(fill) {
        var clone = document.createElement('div'),
            el;
        clone.innerHTML = stencilNode.outerHTML || new XMLSerializer().serializeToString(stencilNode);
        el = clone.firstChild;
        if (fill) {
          el.appendChild(document.createTextNode(fill));
        }
        return el;
      };
    } else {
      makeReplacementNode = nodeName;
    }

    return function replace(range) {

      var startNode = range.startNode,
          endNode = range.endNode,
          matchIndex = range.matchIndex;

      if (startNode === endNode) {
        var node = startNode;
        if (range.startNodeIndex > 0) {
          // Add `before` text node (before the match)
          var before = document.createTextNode(node.data.substring(0, range.startNodeIndex));
          node.parentNode.insertBefore(before, node);
        }

        // Create the replacement node:
        var el = makeReplacementNode(range.match[0], matchIndex);
        node.parentNode.insertBefore(el, node);
        if (range.endNodeIndex < node.length) {
          // Add `after` text node (after the match)
          var after = document.createTextNode(node.data.substring(range.endNodeIndex));
          node.parentNode.insertBefore(after, node);
        }
        node.parentNode.removeChild(node);
        reverts.push(function() {
          var pnode = el.parentNode;
          pnode.insertBefore(el.firstChild, el);
          pnode.removeChild(el);
          pnode.normalize();
        });
        return el;
      } else {
        // Replace startNode -> [innerNodes...] -> endNode (in that order)
        var before = document.createTextNode(startNode.data.substring(0, range.startNodeIndex));
        var after = document.createTextNode(endNode.data.substring(range.endNodeIndex));
        var elA = makeReplacementNode(startNode.data.substring(range.startNodeIndex), matchIndex);
        var innerEls = [];
        for (var i = 0, l = range.innerNodes.length; i < l; ++i) {
          var innerNode = range.innerNodes[i];
          var innerEl = makeReplacementNode(innerNode.data, matchIndex);
          innerNode.parentNode.replaceChild(innerEl, innerNode);
          innerEls.push(innerEl);
        }
        var elB = makeReplacementNode(endNode.data.substring(0, range.endNodeIndex), matchIndex);
        startNode.parentNode.insertBefore(before, startNode);
        startNode.parentNode.insertBefore(elA, startNode);
        startNode.parentNode.removeChild(startNode);
        endNode.parentNode.insertBefore(elB, endNode);
        endNode.parentNode.insertBefore(after, endNode);
        endNode.parentNode.removeChild(endNode);
        reverts.push(function() {
          innerEls.unshift(elA);
          innerEls.push(elB);
          for (var i = 0, l = innerEls.length; i < l; ++i) {
            var el = innerEls[i];
            var pnode = el.parentNode;
            pnode.insertBefore(el.firstChild, el);
            pnode.removeChild(el);
            pnode.normalize();
          }
        });
        return elB;
      }
    };

  }

  return findAndReplaceDOMText;

}());
(function () {
	"use strict";

	var bullshits = [
		'24/7',
		'a-b testing',
		'accessib(?:le|ility)',
		'acquisition',
		'action items?',
		'advantages?',
		'aggregate',
		'(?:framework|platform).agnostic',
		'analytics?',
		'application service providers?',
		'assets?',
		'at the end of the day',
		'authoritative',
		'automated',
		'b2b',
		'back to the drawing board',
		'ball.?park',
		'band.aid',
		'bandwidth',
		'benchmark',
		'benefit analysis',
		'best.of.breed',
		'best.practice',
		'big.data',
		'big picture',
		'bottom line',
		'bottom.up',
		'brain.?storm',
		'brain.?dump',
		'brand(?:s?|ing|ed)',
		'burn rates?',
		'business cases?',
		'business plans?',
		'business.centricity',
		'business.centric',
		'buzz',
		'call to action',
		'capacity',
		'capitalize',
		'center of excellence',
		'challenges?',
		'change agent',
		'circle the wagons',
		'client focus',
		'client.focused',
		'cloud.based',
		'collaborate',
		'collaboration',
		'communicate',
		'communication',
		'compelling',
		'competitive advantage',
		'competitive',
		'community.driven',
		'connect the dots',
		'content management',
		'contingency plan',
		'control group',
		'convergent',
		'conversion',
		'core business',
		'core competenc(?:y|ies)',
		'cost-effective',
		'cost/benefit',
		'craftsmanship',
		'critical path',
		'crm',
		'cross.sell',
		'crowd.?(?:fund(?:s?|ed|ing)|sourc(?:ed|e|ing))',
		'customer.(?:centric|facing|oriented|service|driven)',
		'cutting.edge',
		'data mining',
		'deep dive',
		'delight the customer',
		'deliverables?',
		'demographic',
		'discovery',
		'diversity',
		'downsize',
		'drill down',
		'drink the kool-aid',
		'drop.?in',
		'drop the ball',
		'due dilligence',
		'dynamic',
		'e-?business',
		'e-?commerce',
		'e-?tailers',
		'ecosystem',
		'efficiency',
		'efficient',
		'elaboration',
		'elephant in the room',
		'elevator pitch',
		'emerging markets',
		'empower',
		'empowerment',
		'end of the day',
		'end to end',
		'engage',
		'enhance',
		'enterprise',
		'eta',
		'etched in stone',
		'exceed expectations',
		'expectations',
		'experiences',
		'exposure',
		'eyeballs',
		'facilitate',
		'facilitator',
		'fast track',
		'fault tolerant',
		'first to market',
		'flexibility',
		'focused',
		'followup',
		'foot view',
		'(?:front.?end.|ui.)?frame.?work',
		'front lines',
		'functional',
		'full benefit',
		'game plan',
		'gap analysis',
		'go public',
		'go to market',
		'goals',
		'goal.oriented',
		'going forward',
		'google juice',
		'graceful.degradation',
		'gradual.enhancement',
		'granular',
		'growth',
		'grow',
		'guidance',
		'hardball',
		'having said that',
		'heads.up',
		'heavy.lifting',
		'herding cats',
		'high.level',
		'high.impact',
		'html5',
		'impactful',
		'implementation',
		'in a nutshell',
		'incent',
		'incentivize',
		'innovated',
		'innovation',
		'innovative',
		'innovating',
		'innovate',
		'integrated',
		'integration',
		'internet of things',
		'intellectual property',
		'intuitive',
		'knowledge base',
		'knowledge transfer',
		'landing page',
		'landing pages',
		'lead the field',
		'leadership',
		'legacy',
		'lessons learned',
		'level playing field',
		'level set',
		'leverage',
		'low-hanging fruit',
		'look.(?:&|and).feel',
		'market driven',
		'market leader',
		'market window',
		'marketing collateral',
		'mass.impact',
		'maximize',
		'measurement',
		'methodolog(?:y|ies)',
		'metrics',
		'middleware',
		'milestone',
		'mind share',
		'mind shower',
		'mindset',
		'mindshare',
		'mission.critical',
		'monetize',
		'moving forward',
		'multitask',
		'multitasking',
		'mvc',
		'mvp',
		'negotiated',
		'networking',
		'new economy',
		'next level',
		'niche',
		'niches',
		'no-brainer',
		'non-traditional management',
		'nosql',
		'objectives',
		'occupy the field',
		'off.site meeting',
		'off.the.(?:radar|shelf)',
		'off-?line',
		'on board',
		'on the (?:back end|radar screen|same page)',
		'one to one',
		'OOP',
		'(?:object|aspect|role|subject).oriented',
		'opportunit(?:y|ies)',
		'optimization',
		'out.of.the.(?:box|loop)',
		'outsourc(?:e|ed|ing)',
		'ownership',
		'paradigm shift',
		'paradigms?',
		'partnerships?',
		'partner',
		'patent',
		'performance indicators',
		'personalization',
		'perspective',
		'phase',
		'phased approach',
		'pipeline',
		'planning horizon',
		'plug.?in',
		'prioritized?',
		'proactive',
		'problem space',
		'process assessment',
		'processes',
		'process-centric',
		'profitability',
		'profit',
		'promotional collateral',
		'promotion',
		'proprietary',
		'proof.of.concept',
		'push the envelope',
		'pushback',
		'quality.driven',
		'quick win',
		'rais(?:e|ing) the bar',
		'ramp.up',
		'relationship management',
		'responsive',
		'engagements?',
		'engage',
		'reach out',
		'reactivation',
		'real.time',
		'real.world',
		'reconfigure',
		'red flag',
		'reengineering',
		'reinvent(?:ing)? the(?:.square)? wheel',
		'reinvigorate',
		'relevance',
		'repurpose',
		'resource allocation',
		'restructuring',
		'results.driven',
		'retention',
		'return on investment',
		'reusability',
		'reuse',
		'revenue',
		'reverse.engineer',
		'revisit',
		'road ?map',
		'robust',
		'roi',
		'run the numbers',
		'sales.driven',
		'scale',
		'scenarios?',
		'scope',
		'seamless',
		'search engine optimization',
		'secret sauce',
		'segment',
		'self-managed team',
		'seo',
		'service oriented',
		'shareholder value',
		'single-source responsibility',
		'skill sets?',
		'smoke (?:&|and) mirrors',
		'social(?:.media|.gaming|.networks?)',
		'solutions?',
		'soup to nuts',
		'sow',
		'stakeholder',
		'startup',
		'statement of work',
		'sticky-?ness',
		'strateg(?:y|ic|ize)',
		'streamline',
		'success',
		'sustainab(?:le|ility)',
		'synerg(?:y|ies)',
		'tailwinds?',
		'take offline',
		'talking points',
		'target (?:audience|group)',
		'targeted',
		'tasked',
		'tco',
		'team building',
		'team player',
		'teamwork',
		'technologies',
		'technology solutions',
		'that being said',
		'think(?:ing)? outside the box',
		'time to market',
		'time.critical',
		'timelines?',
		'top.down',
		'top of the game',
		'total cost of ownership',
		'total quality',
		'touch base',
		'touchpoints',
		'traction',
		'turnkey',
		'up to speed',
		'up-?sell',
		'upside',
		'user.friendly',
		'user.experience',
		'user.driven',
		'utilize',
		'unique approach',
		'value-added',
		'values?',
		'vertical market',
		'viral',
		'virtual(?:ization)?',
		'visibility',
		'vision statement',
		'walk the talk',
		'web 2\\.0',
		'web 3\\.0',
		'web-enabled',
		'win-win',
		'window of opportunity',
		'wisdom of crowds',
		'workflow',
		'workshop',
		'world.class',
		'wow factor'
	];
(function(styles){
	var styleElt, styleSheet;
	if (document.createStyleSheet) {
		styleSheet = document.createStyleSheet();
	}
	else{
		var head = document.getEleementsByTagName("head")[0];
		styleElt = document.createElement("style");
		head.appendChild(styleElt);
		styleSheet = document.styleSheets[document.styleSheets.length-1];
	}
	if (styleElt) styleElt.innerHTML = styles;
	else styleSheet.cssText = styles;
}('.BullShit:before{:content:"Bullshit"}'))
	function bulshitize(term) {
		var c = term.charAt(0),
		    bullshit = (c === c.toUpperCase() ? 'B' : 'b') + 'ullshit';

		if (term.substr(term.length - 3) === 'ing') {
			bullshit += 'ing';
		}
		var abbr = document.createElement("abbr");
		abbr.setAttribute("style", "color:red");
		abbr.title = term;
		abbr.innerHTML = bullshit;
		return abbr;
	}
var cl=document.createElement("span");
cl.className-"BullShit";
	var re = new RegExp('(' + bullshits.join('|') + ')(?!\\w|[^<]*>)', 'gi'),
	    body = document.body;
		findAndReplaceDOMText(re,body, cl)
}());

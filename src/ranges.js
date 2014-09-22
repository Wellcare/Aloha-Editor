/**
 * ranges.js is part of Aloha Editor project http://aloha-editor.org
 *
 * Aloha Editor is a WYSIWYG HTML5 inline editing library and editor.
 * Copyright (c) 2010-2014 Gentics Software GmbH, Vienna, Austria.
 * Contributors http://aloha-editor.org/contribution.php
 *
 * @see
 * https://dvcs.w3.org/hg/editing/raw-file/tip/editing.html#deleting-the-selection
 */
define(['dom', 'arrays'], function (Dom, Arrays) {
	'use strict';

	/**
	 * Creates a range object with boundaries defined by containers, and offsets
	 * in those containers.
	 *
	 * @param  {!Element} sc
	 * @param  {number}   so
	 * @param  {!Element} ec
	 * @param  {number}   eo
	 * @return {Range}
	 */
	function create(sc, so, ec, eo) {
		var range = sc.ownerDocument.createRange();
		range.setStart(sc, so || 0);
		if (ec) {
			range.setEnd(ec, eo || 0);
		} else {
			range.setEnd(sc, so || 0);
		}
		return range;
	}

	/**
	 * Creates a range from the horizontal and vertical offset pixel positions
	 * relative to upper-left corner the document body.
	 *
	 * Returns a collapsed range for the position where the text insertion
	 * indicator would be rendered.
	 *
	 * @see:
	 * http://dev.w3.org/csswg/cssom-view/#dom-document-caretpositionfrompoint
	 * http://stackoverflow.com/questions/3189812/creating-a-collapsed-range-from-a-pixel-position-in-ff-webkit
	 * http://jsfiddle.net/timdown/ABjQP/8/
	 * http://lists.w3.org/Archives/Public/public-webapps/2009OctDec/0113.html
	 *
	 * @private
	 * @param  {number}    x
	 * @param  {number}    y
	 * @param  {!Document} doc
	 * @return {?Range}
	 */
	function fromPoint(x, y, doc) {
		if (x < 0 || y < 0) {
			return null;
		}
		if (doc['caretRangeFromPoint']) {
			return doc['caretRangeFromPoint'](x, y);
		}
		if (doc.caretPositionFromPoint) {
			var pos = doc.caretPositionFromPoint(x, y);
			return create(pos.offsetNode, pos.offset);
		}
		if (doc.elementFromPoint) {
			return fromPointIE(x, y, doc);
		}

		throw 'fromPoint() unimplemented for this browser';
	}

	/**
	 * Returns whether x and y are inside or above the given
	 * rectangle as created by range.getClientRects()
	 * @see http://jsfiddle.net/timdown/ABjQP/8/
	 *
	 * @param {int} x
	 * @param {int} y
	 * @param {Rectangle} rect
	 * @return {boolean}
	 */
	function pointIsInOrAboveRect(x, y, rect) {
		return y < rect.bottom && x >= rect.left && x <= rect.right;
	}

	function stepTextNode(node, range, offset, x, y) {
		range.setEnd(node, offset);
		var rect = Arrays.last(range.getClientRects());
		if (rect && pointIsInOrAboveRect(x, y, rect)) {
			if (rect.right - x > x - rect.left) {
				offset--;
			}
			return {
				node  : node,
				index : offset
			};
		}
		if (offset < node.length) {
			return stepTextNode(node, range, ++offset, x, y);
		} 
		return {
			node  : node,
			index : offset
		};
	}

	function findOffset(node, range, x, y) {
		if (Dom.isTextNode(node)) {
			return stepTextNode(node, range, 0, x, y);
		}

		range.setEndAfter(node);
		var rect = Arrays.last(range.getClientRects());
		if (rect && pointIsInOrAboveRect(x, y, rect)) {
			return {
				node  : node.parentNode,
				index : Dom.nodeIndex(node)
			};
		}

		if (node.nextSibling) {
			return findOffset(node.nextSibling, range, x, y);
		}

		return {
			node  : node.parentNode,
			index : Dom.nodeIndex(node)
		};
	}

	/**
	 * http://jsfiddle.net/timdown/ABjQP/8/
	 */
	function fromPointIE(x, y, doc) {
		var el = doc.elementFromPoint(x, y);
		var range = doc.createRange();
		var offset = {
			node  : el.firstChild,
			index : -1
		};

		range.selectNodeContents(el);
		range.collapse(true);

		if (!offset.node) {
			offset = {
				node  : el.parentNode,
				index : Dom.nodeIndex(el)
			};
		} else {
			offset = findOffset(offset.node, range, x, y);
		}
		return create(offset.node, offset.index);
	}


	/**
	 * Gets the given node's nearest non-editable parent.
	 *
	 * @private
	 * @param  {!Node} node
	 * @return {?Element}
	 */
	function parentBlock(node) {
		var block = Dom.isEditable(node) ? Dom.editingHost(node) : node;
		var parent = Dom.upWhile(block, function (node) {
			return node.parentNode && !Dom.isEditable(node.parentNode);
		});
		return (Dom.Nodes.DOCUMENT === parent.nodeType) ? null : parent;
	}

	/**
	 * Derives a range from the horizontal and vertical offset pixel positions
	 * relative to upper-left corner of the document body.
	 *
	 * Returns null if no suitable range can be determined from within an
	 * editable.
	 *
	 * @param  {number}    x
	 * @param  {number}    y
	 * @param  {!Document} doc
	 * @return {?Range}
	 */
	function fromPosition(x, y, doc) {
		var range = fromPoint(x, y, doc);
		if (!range) {
			return null;
		}
		if (Dom.isEditableNode(range.commonAncestorContainer)) {
			return range;
		}
		var block = parentBlock(range.commonAncestorContainer);
		if (!block || !block.parentNode) {
			return null;
		}
		var body = doc.body;
		var offsets = Dom.offset(block);
		var offset = Dom.nodeIndex(block);
		var pointX = x + body.scrollLeft;
		var blockX = offsets.left + body.scrollLeft + block.offsetWidth;
		if (pointX > blockX) {
			offset += 1;
		}
		return create(block.parentNode, offset);
	}

	/**
	 * Checks whether two ranges are equal. Ranges are equal if their
	 * corresponding boundary containers and offsets are strictly equal.
	 *
	 * @param  {Range} a
	 * @param  {Range} b
	 * @return {boolean}
	 */
	function equals(a, b) {
		return a.startContainer === b.startContainer
			&& a.startOffset    === b.startOffset
			&& a.endContainer   === b.endContainer
			&& a.endOffset      === b.endOffset;
	}

	return {
		equals       : equals,
		create       : create,
		fromPosition : fromPosition
	};
});

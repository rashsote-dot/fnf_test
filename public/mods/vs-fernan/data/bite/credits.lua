local Locate = 'stages/credits/'

function onCreatePost()
	-- Precache
	precacheImage(Locate..'title')
	precacheImage(Locate..'oc')
	precacheImage(Locate..'cc')
	precacheImage(Locate..'msg')
	precacheImage(Locate..'tfw')

	-- Credits Text
	makeLuaSprite('title', Locate..'title', -381, 98)
	setProperty('title.antialiasing', false)
	setObjectCamera('title', 'other')
	setScrollFactor('title', 1, 1)
	--setProperty('title.alpha', 1)
	
	makeLuaSprite('oc', Locate..'oc', -720, 160)
	setProperty('oc.antialiasing', false)
	setObjectCamera('oc', 'other')
	setScrollFactor('oc', 1, 1)
	--setProperty('oc.alpha', 1)
	
	makeLuaSprite('cc', Locate..'cc', -626, 263)
	setProperty('cc.antialiasing', false)
	setObjectCamera('cc', 'other')
	setScrollFactor('cc', 1, 1)
	--setProperty('cc.alpha', 1)
	
	makeLuaSprite('msg', Locate..'msg', -668, 371)
	setProperty('msg.antialiasing', false)
	setObjectCamera('msg', 'other')
	setScrollFactor('msg', 1, 1)
	--setProperty('msg.alpha', 1)
	
	makeLuaSprite('tfw', Locate..'tfw', 1300, 134)
	setProperty('tfw.antialiasing', false)
	setObjectCamera('tfw', 'other')
	setScrollFactor('tfw', 1, 1)
	--setProperty('tfw.alpha', 1)
	
	-- Add Sprites
	addLuaSprite('title', true)
	addLuaSprite('oc', true)
	addLuaSprite('cc', true)
	addLuaSprite('msg', true)
	addLuaSprite('tfw', true)
end

--motion functions
function onSongStart()
	-- Inst and Vocals start playing, songPosition = 0
	doTweenX('titleTweenX', 'title', 165, 1, 'CircInOut')
	
	runTimer('otc', 1, 1)
end

function onEvent(name, value1, value2)
	if name == 'CreditsEnd' then
		doTweenX('tfwTweenX', 'tfw', 850, value1, 'CircInOut')
		runTimer('tfwb', value2, 1)
	end
end

function onTimerCompleted(tag, loops, loopsLeft)
	-- A loop from a timer you called has been completed, value "tag" is it's tag
	-- loops = how many loops it will have done when it ends completely
	-- loopsLeft = how many are remaining
	
	if tag == 'otc' then
		doTweenX('ocTweenX', 'oc', 165, 1, 'CircInOut')
		runTimer('otc2', 1, 1)
	end
	
	if tag == 'otc2' then
		doTweenX('ccTweenX', 'cc', 165, 1, 'CircInOut')
		runTimer('msgt', 1, 1)
	end
	
	if tag == 'msgt' then
		doTweenX('msgTweenX', 'msg', 165, 4, 'Linear')
		runTimer('byebye0', 6, 1)
	end
	
	
	if tag == 'byebye0' then
		doTweenX('titleTweenX', 'title', -381, 0.8, 'CircInOut')
		runTimer('byebye1', 0.5, 1)
	end
	
	if tag == 'byebye1' then
		doTweenX('ocTweenX', 'oc', -720, 0.8, 'CircInOut')
		runTimer('byebye2', 0.5, 1)
	end
	
	if tag == 'byebye2' then
		doTweenX('ccTweenX', 'cc', -626, 0.8, 'CircInOut')
		runTimer('byebye3', 1, 1)
	end
	
	if tag == 'byebye3' then
		doTweenX('msgTweenX', 'msg', -668, 0.2, 'Linear')
		runTimer('remove1', 0.5, 1)
	end
	
	if tag == 'tfwb' then
		doTweenX('tfwTweenX', 'tfw', 1300, 1, 'CircIn')
		runTimer('remove2', 1.5, 1)
	end
	
	
	if tag == 'remove1' then
		removeLuaSprite('title', true)
		removeLuaSprite('oc', true)
		removeLuaSprite('cc', true)
		removeLuaSprite('msg', true)
	end
	
	if tag == 'remove2' then
		removeLuaSprite('tfw', true)
	end
end
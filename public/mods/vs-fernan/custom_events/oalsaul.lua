function onCreatePost()
	-- C oal saul
	makeAnimatedLuaSprite('saul', 'stages/screens/holasaul', 890, 0)
	addAnimationByPrefix('saul', 'oal', 'holasaul0', 60, false)
	setProperty('saul.antialiasing', false)
	setProperty('saul.visible', false)
	setObjectCamera('saul', 'other')
	setScrollFactor('saul', 1, 1)
	--scaleObject('saul', 1, 1)
	
	-- Add Sprite
	addLuaSprite('saul', true)
end

function onEvent(name, value1, value2)
	if name == 'oalsaul' then
		setProperty('saul.visible', true)
		objectPlayAnimation('saul', 'oal', true)
		runTimer('sassuus', 1.5)
	end
end

function onTimerCompleted(tag, loops, loopsLeft)
	if tag == 'sassuus' then
		setProperty('saul.visible', false)
	end
end
function onEvent(name, value1, value2)
	if name == 'maltillo' then
		doTweenAlpha('martilloleryAlphaY', 'martillolery', 1, 0.5, 'SineOut')
		doTweenAngle('martilloleryAngleX', 'martillolery',  25, 0.5, 'SineInOut')
		runTimer('uuuh', 0.5)
	end
end

function onTimerCompleted(tag, loops, loopsLeft) -- penis
	if tag == 'uuuh' then
		doTweenX('martilloleryTweenX', 'martillolery', 0, 0.75, 'Linear')
		doTweenY('martilloleryTweenY', 'martillolery', getProperty('martillolery.y') - 60, 0.2, 'SineOut')
		doTweenAngle('martilloleryAngleX2', 'martillolery', -3600, 1, 'Linear')
		runTimer('golpea', 0.2)
	end
	
	if tag == 'golpea' then
		doTweenY('martilloleryTweenY2', 'martillolery', 380, 0.7, 'cubeInOut')
		runTimer('adios', 1)
	end
	
	if tag == 'adios' then
		doTweenAlpha('martilloleryAlphaY2', 'martillolery', 0, 0.25, 'SineOut')
	end
end